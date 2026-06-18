import dotenv from "dotenv";
import path from "path";

// Load .env from the server package directory
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

console.log("Starting add-fake-matches script...");
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "NOT SET");

import { DATA_SOURCE } from "../db/data-source";
import { initDynamicEntities } from "../db/entities/dyn/init";
import { Event } from "../db/entities/Event";
import { Match } from "../db/entities/Match";
import { TeamMatchParticipation } from "../db/entities/TeamMatchParticipation";
import { Season, TournamentLevel } from "@ftc-scout/common";

async function addFakeMatches(season: Season, eventCode: string, count: number = 5) {
    console.info(`Adding ${count} fake matches to event ${eventCode} in season ${season}...`);

    // Get the event
    const event = await Event.findOneBy({ season, code: eventCode });
    if (!event) {
        throw new Error(`Event ${eventCode} not found for season ${season}`);
    }

    console.info(`Event found: ${event.name}`);

    // Get teams that have already participated in matches at this event
    const existingTeamParticipations = await DATA_SOURCE.getRepository(TeamMatchParticipation)
        .createQueryBuilder("tmp")
        .select("DISTINCT tmp.teamNumber", "teamNumber")
        .where("tmp.season = :season", { season })
        .andWhere("tmp.eventCode = :eventCode", { eventCode })
        .getRawMany();

    const teamNumbers = existingTeamParticipations.map((t) => t.teamNumber);

    if (teamNumbers.length < 4) {
        throw new Error(
            `Event ${eventCode} needs at least 4 teams with match participations. Found ${teamNumbers.length} teams. ` +
                `Please load some real matches first using: npx ts-node src/scripts/run-load-event-matches.ts ${season} ${eventCode}`
        );
    }

    console.info(`Found ${teamNumbers.length} teams that have participated in matches`);

    // Find the highest match ID currently in the event
    /*
    const existingMatches = await DATA_SOURCE.getRepository(Match).find({
        where: {
            eventSeason: season,
            eventCode: eventCode,
        },
        order: {
            id: "DESC",
        },
        take: 1,
    });
*/

    const startMatchId = 9000; // existingMatches.length > 0 ? existingMatches[0].id + 1 :
    console.info(`Starting fake match IDs from: ${startMatchId}`);

    const fakeMatches: Match[] = [];
    const fakeParticipations: TeamMatchParticipation[] = [];

    for (let i = 0; i < count; i++) {
        const matchId = startMatchId + i;

        // Create a fake match
        const fakeMatch = Match.create({
            eventSeason: season,
            eventCode: eventCode,
            id: matchId,
            hasBeenPlayed: false,
            scheduledStartTime: null,
            actualStartTime: null,
            postResultTime: null,
            tournamentLevel: TournamentLevel.Quals,
            series: 1,
        });

        fakeMatch.event = event;
        fakeMatch.teams = [];
        fakeMatch.scores = [];

        // Create team participations using real teams (6 teams per match)
        const stations = ["Red1", "Red2", "Blue1", "Blue2"] as const;
        for (let j = 0; j < stations.length; j++) {
            // Cycle through available teams to assign to matches
            const teamNumber = teamNumbers[(i * 4 + j) % teamNumbers.length];

            const fakeTeam = TeamMatchParticipation.create({
                season: season,
                eventCode: eventCode,
                matchId: matchId,
                teamNumber: teamNumber,
                station: j % 2 ? "Two" : "One",
                alliance: stations[j].startsWith("Red") ? "Red" : "Blue",
                allianceRole: "Solo",
                surrogate: false,
                dq: false,
                noShow: false,
                onField: true,
            });

            fakeTeam.match = fakeMatch;
            fakeParticipations.push(fakeTeam);
        }

        fakeMatches.push(fakeMatch);
    }

    // Save to database
    console.info(`Saving ${fakeMatches.length} fake matches to database...`);
    await DATA_SOURCE.transaction(async (em) => {
        await em.save(Match, fakeMatches);
        await em.save(TeamMatchParticipation, fakeParticipations);
    });

    console.info(`Successfully added ${fakeMatches.length} fake matches`);
    console.info(`Match IDs: ${fakeMatches.map((m) => m.id).join(", ")}`);
    return {
        matches: fakeMatches.length,
        participations: fakeParticipations.length,
        matchIds: fakeMatches.map((m) => m.id),
        teamsUsed: teamNumbers.length,
    };
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.error("Usage: ts-node run-add-fake-matches.ts <season> <eventCode> [count]");
        console.error("Example: ts-node run-add-fake-matches.ts 2025 MXBC 5");
        console.error("Example: ts-node run-add-fake-matches.ts 2025 USWAROSE 10");
        console.error(
            "\nThis will add fake qualification matches to the database that can be used to test"
        );
        console.error("the delete functionality in the load-event-matches script.");
        console.error(
            "\nNote: The event must have at least 4 teams with existing match participations."
        );
        console.error(
            "      The fake matches will use real teams from the event (4 teams per match)."
        );
        console.error("\nDefault count: 5 matches");
        process.exit(1);
    }

    const season = Number(args[0]) as Season;
    const eventCode = args[1];
    const count = args[2] ? Number(args[2]) : 5;

    if (!season || isNaN(season)) {
        console.error("Error: season must be a valid number");
        process.exit(1);
    }

    if (!eventCode || eventCode.trim() === "") {
        console.error("Error: eventCode must be provided");
        process.exit(1);
    }

    if (isNaN(count) || count < 1 || count > 100) {
        console.error("Error: count must be a number between 1 and 100");
        process.exit(1);
    }

    try {
        console.log(`Initializing database connection...`);
        await DATA_SOURCE.initialize();
        initDynamicEntities();

        const result = await addFakeMatches(season, eventCode, count);

        console.log(`Fake matches added: ${result.matches}`);

        process.exit(0);
    } catch (error) {
        console.error("Error adding fake matches:", error);
        process.exit(1);
    }
}

main();
