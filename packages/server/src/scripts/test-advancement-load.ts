import dotenv from "dotenv";
import path from "path";

// Load .env from the server package directory
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { DATA_SOURCE } from "../db/data-source";
import { initDynamicEntities } from "../db/entities/dyn/init";
import { AdvancementScore } from "../db/entities/AdvancementScore";

async function testAdvancementLoad() {
    try {
        console.log("Initializing database connection...");
        await DATA_SOURCE.initialize();
        initDynamicEntities();

        // Load an advancement score with a non-null advancement_rank
        const scores = await AdvancementScore.find({
            where: { season: 2025, eventCode: "USMSGUQ" },
            order: { rank: "ASC" },
            take: 5,
        });

        console.log("\nLoaded AdvancementScore entities:");
        console.log(JSON.stringify(scores, null, 2));

        console.log("\nChecking advancementRank field specifically:");
        scores.forEach((score, index) => {
            console.log(
                `Score ${index}: teamNumber=${score.teamNumber}, rank=${score.rank}, advancementRank=${score.advancementRank}`
            );
        });
    } catch (error) {
        console.error("Error:", error);
    } finally {
        await DATA_SOURCE.destroy();
        process.exit(0);
    }
}

testAdvancementLoad().catch(console.error);
