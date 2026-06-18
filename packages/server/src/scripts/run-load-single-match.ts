import dotenv from "dotenv";
import path from "path";

// Load .env from the server package directory
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

console.log("Starting load-single-match script...");
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
import { newMatchesKey, pubsub } from "../graphql/resolvers/pubsub";

function findScores(match: MatchFtcApi, scores: MatchScoresFtcApi[]): MatchScoresFtcApi[] {
    return scores.filter((s) =>
        "teamNumber" in s
            ? match.teams[0].teamNumber == s.teamNumber && match.matchNumber == s.matchNumber
            : match.tournamentLevel == s.matchLevel &&
              match.series == s.matchSeries &&
              match.matchNumber == s.matchNumber
    );
}

async function loadSingleMatch(season: Season, eventCode: string, matchNumber: number) {
    console.info(`Loading match ${matchNumber} for event ${eventCode} in season ${season}...`);

    // Get the event
    const event = await Event.findOneBy({ season, code: eventCode });
    if (!event) {
        throw new Error(`Event ${eventCode} not found for season ${season}`);
    }

    // Fetch all matches and scores for the event (API doesn't support single match queries)
    const [matches, scores, teams] = await Promise.all([
        getMatches(season, eventCode),
        getMatchScores(season, eventCode),
        getTeams(season, eventCode),
    ]);

    // Find the specific match
    const match = matches.find((m) => m.matchNumber === matchNumber);
    if (!match) {
        throw new Error(`Match ${matchNumber} not found in event ${eventCode}`);
    }

    console.info(`Found match: ${match.description}`);

    // Process the match
    const theseScores = findScores(match, scores);
    const hasBeenPlayed = !!theseScores.length;
    const dbMatch = Match.fromApi(match, event, hasBeenPlayed, matches);
    const dbTmps = TeamMatchParticipation.fromApi(match.teams, dbMatch, event.remote);
    const dbScores =
        event.remote && dbTmps[0].noShow
            ? [] // Remote matches that weren't played still return scores
            : theseScores.flatMap((s) => MatchScore.fromApi(s, dbMatch, event.remote));

    dbMatch.teams = dbTmps;
    dbMatch.scores = dbScores;

    console.info(`Match has ${dbScores.length} scores and ${dbTmps.length} team participations`);

    // Get all teams for recalculating stats
    const matchTeams = dbMatch.teams.map((t) => t.teamNumber);
    const allTeams = [...new Set([...matchTeams, ...teams.map((t) => t.teamNumber)])];

    // Recalculate team event stats for all matches (needed for accurate stats)
    const allDbMatches = await DATA_SOURCE.getRepository(Match).find({
        where: { eventSeason: season, eventCode: eventCode },
        relations: ["teams", "scores"],
    });

    // Update the match in the list
    const matchIndex = allDbMatches.findIndex((m) => m.id === dbMatch.id);
    if (matchIndex >= 0) {
        allDbMatches[matchIndex] = dbMatch;
    } else {
        allDbMatches.push(dbMatch);
    }

    const allDbTeps: Partial<TeamEventParticipation>[] = calculateTeamEventStats(
        season,
        eventCode,
        event.remote,
        allDbMatches.map((m) => m.toFrontend()),
        allTeams
    );

    // Save to database
    await DATA_SOURCE.transaction(async (em) => {
        await em.save(Match, dbMatch);
        await em.save(TeamMatchParticipation, dbTmps);
        await em.getRepository(MatchScoreSchemas[season]).save(dbScores);
        await em.getRepository(TepSchemas[season]).save(allDbTeps, { chunk: 100 });
    });

    // Publish update
    pubsub.publish(newMatchesKey(season, eventCode), { newMatches: [dbMatch] });

    console.info(`Successfully loaded match ${matchNumber} for event ${eventCode}`);
    return dbMatch;
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 3) {
        console.error("Usage: ts-node run-load-single-match.ts <season> <eventCode> <matchNumber>");
        console.error("Example: ts-node run-load-single-match.ts 2025 MXBC 1");
        console.error("Example: ts-node run-load-single-match.ts 2025 MXBC 42");
        console.error(
            "\nNote: matchNumber is the actual match number (e.g., 1 for Q-1, 42 for Q-42)"
        );
        process.exit(1);
    }

    const season = Number(args[0]) as Season;
    const eventCode = args[1];
    const matchNumber = Number(args[2]);

    if (!season || isNaN(season)) {
        console.error("Error: season must be a valid number");
        process.exit(1);
    }

    if (!eventCode || eventCode.trim() === "") {
        console.error("Error: eventCode must be provided");
        process.exit(1);
    }

    if (!matchNumber || isNaN(matchNumber)) {
        console.error("Error: matchNumber must be a valid number");
        process.exit(1);
    }

    try {
        console.log(`Initializing database connection...`);
        await DATA_SOURCE.initialize();
        initDynamicEntities();

        await loadSingleMatch(season, eventCode, matchNumber);

        console.log(`Successfully loaded match ${matchNumber} for ${eventCode} in ${season}`);
        process.exit(0);
    } catch (error) {
        console.error("Error loading match:", error);
        process.exit(1);
    }
}

main();
