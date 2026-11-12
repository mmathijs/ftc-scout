import dotenv from "dotenv";
import path from "path";

// Load .env from the server package directory
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

console.log("Starting load-event-matches script...");
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "NOT SET");

import { DATA_SOURCE } from "../db/data-source";
import { initDynamicEntities } from "../db/entities/dyn/init";
import { getMatches } from "../ftc-api/get-matches";
import { getMatchScores } from "../ftc-api/get-match-scores";
import { getTeams } from "../ftc-api/get-teams";
import { Event } from "../db/entities/Event";
import { Match } from "../db/entities/Match";
import { TeamMatchParticipation } from "../db/entities/TeamMatchParticipation";
import { MatchScore, MatchScoreSchemas } from "../db/entities/dyn/match-score";
import {
    TeamEventParticipation,
    TeamEventParticipationSchemas as TepSchemas,
} from "../db/entities/dyn/team-event-participation";
import { Season, MatchFtcApi, MatchScoresFtcApi, calculateTeamEventStats } from "@ftc-scout/common";
import { IS_DEV } from "../constants";
import { exit } from "process";

const IGNORED_MATCHES = [
    //cSpell:disable
    { season: Season.UltimateGoal, eventCode: "USNYEXS1", teamNumber: 14903 },
    { season: Season.UltimateGoal, eventCode: "USNYEXS1", teamNumber: 17222 },
    { season: Season.UltimateGoal, eventCode: "USNJCWS1", teamNumber: 9889 },
    //cSpell:enable
];

function isIgnored(season: Season, eCode: string, m: MatchFtcApi): boolean {
    return IGNORED_MATCHES.some(
        (im) =>
            im.season == season &&
            im.eventCode == eCode &&
            m.teams.some((t) => im.teamNumber == t.teamNumber)
    );
}

function findScores(match: MatchFtcApi, scores: MatchScoresFtcApi[]): MatchScoresFtcApi[] {
    return scores.filter((s) =>
        "teamNumber" in s
            ? match.teams[0].teamNumber == s.teamNumber && match.matchNumber == s.matchNumber
            : match.tournamentLevel == s.matchLevel &&
              match.series == s.matchSeries &&
              match.matchNumber == s.matchNumber
    );
}

type LeagueKey = {
    leagueCode: string;
    regionCode: string | null;
};

function toLeagueKey(code: string, regionCode: string | null): string {
    return `${code}::${regionCode ?? ""}`;
}

async function loadEventMatches(season: Season, eventCode: string) {
    console.info(`Loading all matches for event ${eventCode} in season ${season}...`);

    // Get the event
    const event = await Event.findOneBy({ season, code: eventCode });
    if (!event) {
        throw new Error(`Event ${eventCode} not found for season ${season}`);
    }

    console.info(`Event found: ${event.name}`);

    /*// Fetch all matches, scores, and teams for the event
    const [matches, scores, teams] = await Promise.all([
        getMatches(season, eventCode),
        getMatchScores(season, eventCode),
        getTeams(season, eventCode),
    ]);

    console.info(`Fetched ${matches.length} matches, ${scores.length} scores, ${teams.length} teams`);

    let allDbMatches: Match[] = [];
    let allDbScores: MatchScore[] = [];
    let allDbTmps: TeamMatchParticipation[] = [];

    for (let match of matches) {
        if (isIgnored(season, eventCode, match)) {
            console.info(`Ignoring match ${match.matchNumber} (in ignore list)`);
            continue;
        }

        let theseScores = findScores(match, scores);
        let hasBeenPlayed = !!theseScores.length;
        let dbMatch = Match.fromApi(match, event, hasBeenPlayed, matches);
        let dbTmps = TeamMatchParticipation.fromApi(match.teams, dbMatch, event.remote);
        let dbScores =
            event.remote && dbTmps[0].noShow
                ? [] // Remote matches that weren't played still return scores
                : theseScores.flatMap((s) => MatchScore.fromApi(s, dbMatch, event.remote));

        dbMatch.teams = dbTmps;
        dbMatch.scores = dbScores;

        allDbMatches.push(dbMatch);
        allDbScores.push(...dbScores);
        allDbTmps.push(...dbTmps);
    }

    console.info(`Processed ${allDbMatches.length} matches`);

    // Remove deleted matches (matches that are in the db but not in the api)
    let matchIds = matches.map((m) => m.matchNumber);
    let dbMatchesToDelete = await DATA_SOURCE.getRepository(Match).find({
        where: {
            eventSeason: season,
            eventCode: eventCode,
            tournamentLevel: "Quals",
            id: Not(In(matchIds)),
        },
    });

    console.log("Matches to delete:", dbMatchesToDelete.map((m) => m.id));
/!*
    if (dbMatchesToDelete.length > 0) {
        console.info(`Removing ${dbMatchesToDelete.length} deleted matches from database`);
        const matchIdsToDelete = dbMatchesToDelete.map((m) => m.id);

        await DATA_SOURCE.transaction(async (em) => {
            // First delete all TeamMatchParticipation records for these matches
            await em.delete(TeamMatchParticipation, {
                season: season,
                eventCode: eventCode,
                matchId: In(matchIdsToDelete),
            });

            // Then delete the matches
            await em.remove(dbMatchesToDelete);
        });
    }
*!/

    // We can't just use the teams list because it sometimes misses teams
    let allTeams = allDbMatches.flatMap((m) => m.teams.map((t) => t.teamNumber));
    allTeams = allTeams.concat(teams.map((t) => t.teamNumber));
    allTeams = [...new Set(allTeams)];

    console.info(`Calculating stats for ${allTeams.length} teams`);

    let allDbTeps: Partial<TeamEventParticipation>[] = calculateTeamEventStats(
        season,
        eventCode,
        event.remote,
        allDbMatches.map((m) => m.toFrontend()),
        allTeams
    );

    // Save to database
    console.info(`Saving to database...`);
    await DATA_SOURCE.transaction(async (em) => {
        await em.save(allDbMatches, { chunk: 100 });
        await em.save(allDbTmps, { chunk: 500 });
        await em.getRepository(MatchScoreSchemas[season]).save(allDbScores, { chunk: 100 });
        await em.getRepository(TepSchemas[season]).save(allDbTeps, { chunk: 100 });
    });

    // Publish updates
    let updatedScores = allDbScores.filter((m) => "updatedAt" in m);
    let updatedTmps = allDbTmps.filter((tmp) => "updatedAt" in tmp);
    let updatedMatches = allDbMatches.filter((m) => {
        return (
            "updatedAt" in (m as any) ||
            updatedScores.some((s) => m.eventCode == s.eventCode && m.id == s.matchId) ||
            updatedTmps.some((tmp) => m.eventCode == tmp.eventCode && m.id == tmp.matchId)
        );
    });

    if (updatedMatches.length > 0) {
        pubsub.publish(newMatchesKey(season, eventCode), { newMatches: updatedMatches });
        console.info(`Published ${updatedMatches.length} match updates`);
    }*/

    let leaguesToRecompute = new Map<string, LeagueKey>();
    let advancementToRecompute = new Set<string>();

    let allDbMatches: Match[] = [];
    let allDbScores: MatchScore[] = [];
    let allDbTmps: TeamMatchParticipation[] = [];
    let allTeams: TeamMatchParticipation["teamNumber"][] = [];
    let updatedMatches: Match[] = [];
    let dbMatchesToDelete: Match[] = [];

    try {
        let [matches, scores, teams] = await Promise.all([
            getMatches(season, event.code),
            getMatchScores(season, event.code),
            getTeams(season, event.code),
        ]);

        console.log(JSON.stringify(matches));

        /*        let leagueTeams: LeagueTeam[] = [];
        if (event.leagueCode) {
            let seen = new Set<number>();
            leagueTeams = teams
                .map((team) => team.teamNumber)
                .filter((num): num is number => num != null)
                .filter((num) => {
                    if (seen.has(num)) return false;
                    seen.add(num);
                    return true;
                })
/!*                .map((num) =>
                    LeagueTeam.createFromTeamNumer(season, event.leagueCode!, num, event.regionCode ?? "UNKNOWN")
                );*!/
        }*/

        for (let match of matches) {
            if (isIgnored(season, event.code, match)) continue;

            let theseScores = findScores(match, scores);
            let hasBeenPlayed = !!theseScores.length;
            let dbMatch = Match.fromApi(match, event, hasBeenPlayed, matches);
            let dbTmps = TeamMatchParticipation.fromApi(match.teams, dbMatch, event.remote);
            let dbScores =
                event.remote && dbTmps[0].noShow
                    ? [] // Remote matches that weren't played still return scores
                    : theseScores.flatMap((s) => MatchScore.fromApi(s, dbMatch, event.remote));

            dbMatch.teams = dbTmps;
            dbMatch.scores = dbScores;

            allDbMatches.push(dbMatch);
            allDbScores.push(...dbScores);
            allDbTmps.push(...dbTmps);
        }

        // We can't just use the teams list because it sometimes misses teams?
        // Ex. team 23512 here https://ftc-events.firstinspires.org/2023/USCANOCMPSI/qualifications
        allTeams = allDbMatches.flatMap((m) => m.teams.map((t) => t.teamNumber));
        allTeams = allTeams.concat(teams.map((t) => t.teamNumber));
        allTeams = [...new Set(allTeams)];

        console.log("All teams:", allTeams);

        let allDbTeps: Partial<TeamEventParticipation>[] = calculateTeamEventStats(
            season,
            event.code,
            event.remote,
            allDbMatches.map((m) => m.toFrontend()),
            allTeams
        );

        console.log(JSON.stringify(allDbTeps));

        await DATA_SOURCE.transaction(async (em) => {
            await em.save(allDbMatches, { chunk: 100 });
            await em.save(allDbTmps, { chunk: 500 });
            await em.getRepository(MatchScoreSchemas[season]).save(allDbScores, { chunk: 100 });
            await em.getRepository(TepSchemas[season]).save(allDbTeps, { chunk: 100 });
            /*            if (leagueTeams.length) {
                await em.getRepository(LeagueTeam).save(leagueTeams, { chunk: 200 });
            }*/
        });

        let updatedScores = allDbScores.filter((m) => "updatedAt" in m);
        let updatedTmps = allDbTmps.filter((tmp) => "updatedAt" in tmp);
        updatedMatches = allDbMatches.filter((m) => {
            return (
                "updatedAt" in (m as any) ||
                updatedScores.some((s) => m.eventCode == s.eventCode && m.id == s.matchId) ||
                updatedTmps.some((tmp) => m.eventCode == tmp.eventCode && m.id == tmp.matchId)
            );
        });

        if (event.leagueCode) {
            leaguesToRecompute.set(toLeagueKey(event.leagueCode, event.regionCode ?? null), {
                leagueCode: event.leagueCode,
                regionCode: event.regionCode ?? null,
            });
        }

        if (season >= 2025) {
            advancementToRecompute.add(event.code);
        }
    } catch (e) {
        console.error(e);

        if (IS_DEV) {
            exit(1);
        }
    }

    console.info(`Successfully loaded ${allDbMatches.length} matches for event ${eventCode}`);
    return {
        matches: allDbMatches.length,
        scores: allDbScores.length,
        participations: allDbTmps.length,
        teams: allTeams.length,
        updated: updatedMatches.length,
        deleted: dbMatchesToDelete.length,
    };
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.error("Usage: ts-node run-load-event-matches.ts <season> <eventCode>");
        console.error("Example: ts-node run-load-event-matches.ts 2025 MXBC");
        console.error("Example: ts-node run-load-event-matches.ts 2025 USWAROSE");
        console.error("\nThis will load all matches for the specified event.");
        process.exit(1);
    }

    const season = Number(args[0]) as Season;
    const eventCode = args[1];

    if (!season || isNaN(season)) {
        console.error("Error: season must be a valid number");
        process.exit(1);
    }

    if (!eventCode || eventCode.trim() === "") {
        console.error("Error: eventCode must be provided");
        process.exit(1);
    }

    try {
        console.log(`Initializing database connection...`);
        await DATA_SOURCE.initialize();
        initDynamicEntities();

        const result = await loadEventMatches(season, eventCode);

        console.log(`\n✅ Success! Summary:`);
        console.log(`   - Matches loaded: ${result.matches}`);
        console.log(`   - Scores processed: ${result.scores}`);
        console.log(`   - Team participations: ${result.participations}`);
        console.log(`   - Teams with stats: ${result.teams}`);
        console.log(`   - Matches updated: ${result.updated}`);
        console.log(`   - Matches deleted: ${result.deleted}`);

        process.exit(0);
    } catch (error) {
        console.error("Error loading event matches:", error);
        process.exit(1);
    }
}

main();
