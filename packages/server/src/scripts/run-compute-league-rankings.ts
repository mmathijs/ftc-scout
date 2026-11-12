import dotenv from "dotenv";
import path from "path";

// Load .env from the server package directory
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

console.log("Starting compute-league-rankings script...");
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "NOT SET");

import { DATA_SOURCE } from "../db/data-source";
import { initDynamicEntities } from "../db/entities/dyn/init";
import { recomputeLeagueRankings } from "../db/loaders/recompute-league-rankings";
import { Season } from "@ftc-scout/common";

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.error(
            "Usage: ts-node run-compute-league-rankings.ts <season> <leagueCode> [regionCode]"
        );
        console.error("Example: ts-node run-compute-league-rankings.ts 2025 'MAR'");
        console.error("Example: ts-node run-compute-league-rankings.ts 2025 'MAR' 'MAREG'");
        process.exit(1);
    }

    const season = Number(args[0]) as Season;
    const leagueCode = args[1];
    const regionCode = args[2] ?? null;

    if (!season || isNaN(season)) {
        console.error("Error: season must be a valid number");
        process.exit(1);
    }

    if (!leagueCode || leagueCode.trim() === "") {
        console.error("Error: leagueCode must be provided");
        process.exit(1);
    }

    try {
        console.log(`Initializing database connection...`);
        await DATA_SOURCE.initialize();
        initDynamicEntities();

        console.log(
            `Computing league rankings for season ${season}, league ${leagueCode}${
                regionCode ? `, region ${regionCode}` : ""
            }...`
        );
        await recomputeLeagueRankings(season, leagueCode, regionCode);

        console.log(
            `Successfully computed league rankings for season ${season}, league ${leagueCode}${
                regionCode ? `, region ${regionCode}` : ""
            }`
        );
        process.exit(0);
    } catch (error) {
        console.error("Error computing league rankings:", error);
        process.exit(1);
    }
}

main();
