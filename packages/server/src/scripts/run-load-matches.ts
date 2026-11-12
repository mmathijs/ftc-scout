import dotenv from "dotenv";
import path from "path";

// Load .env from the server package directory
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

console.log("Starting load-matches script...");
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "NOT SET");

import { DATA_SOURCE } from "../db/data-source";
import { initDynamicEntities } from "../db/entities/dyn/init";
import { loadAllMatches } from "../db/loaders/load-all-matches";
import { LoadType } from "../ftc-api/watch";
import { Season } from "@ftc-scout/common";

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.error("Usage: ts-node run-load-matches.ts <season> [loadType]");
        console.error("Example: ts-node run-load-matches.ts 2025 Partial");
        console.error("Example: ts-node run-load-matches.ts 2025 Full");
        console.error("\nLoad types:");
        console.error("  Partial (default) - Load matches for events currently in progress");
        console.error("  Full              - Load matches for all events from the past month");
        process.exit(1);
    }

    const season = Number(args[0]) as Season;
    const loadTypeArg = args[1] || "Partial";

    if (!season || isNaN(season)) {
        console.error("Error: season must be a valid number");
        process.exit(1);
    }

    if (loadTypeArg !== "Partial" && loadTypeArg !== "Full") {
        console.error("Error: loadType must be either 'Partial' or 'Full'");
        process.exit(1);
    }

    const loadType = loadTypeArg as LoadType;

    try {
        console.log(`Initializing database connection...`);
        await DATA_SOURCE.initialize();
        initDynamicEntities();

        console.log(`Loading all matches for season ${season} (${loadType})...`);
        await loadAllMatches(season, loadType);

        console.log(`Successfully loaded matches for season ${season}`);
        process.exit(0);
    } catch (error) {
        console.error("Error loading matches:", error);
        process.exit(1);
    }
}

main();
