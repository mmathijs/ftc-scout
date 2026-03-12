import dotenv from "dotenv";
import path from "path";

// Load .env from the server package directory
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

console.log("Starting compute-advancement script...");
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "NOT SET");

import { DATA_SOURCE } from "../db/data-source";
import { initDynamicEntities } from "../db/entities/dyn/init";
import { computeAdvancementForEvent } from "../db/loaders/compute-advancement";
import { AwardFtcApi, notEmpty, Season } from "@ftc-scout/common";
import { getEventAwards } from "../ftc-api/get-event-awards";
import { Award } from "../db/entities/Award";
import { getAdvancementSlots } from "../ftc-api/get-advancement-slots";

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 1 || args.length > 2) {
        console.error("Usage: ts-node run-compute-advancement.ts <season> <eventCode>");
        console.error("Example: ts-node run-compute-advancement.ts 2025 'MXBC'");
        process.exit(1);
    }

    const season = Number(args[0]) as Season;
    const eventCode = args[1];

    if (!season || isNaN(season)) {
        console.error("Error: season must be a valid number");
        process.exit(1);
    }

    /*    if (!eventCode || eventCode.trim() === "") {
        console.error("Error: eventCode must be provided");
        process.exit(1);
    }*/

    try {
        console.log(`Initializing database connection...`);
        await DATA_SOURCE.initialize();
        initDynamicEntities();

        let eventCodes = [];

        if (eventCode && eventCode.trim() !== "") {
            eventCodes.push(eventCode);
        } else {
            eventCodes = await DATA_SOURCE.getRepository("Event")
                .find({ where: { season } })
                .then((events) => events.map((e) => e.code));
        }

        for (let code of eventCodes) {
            console.log(`Computing advancement for season ${season}, event ${code}...`);

            let event = await DATA_SOURCE.getRepository("Event").findOneBy({
                season,
                code: code,
            });
            if (!event) {
                throw new Error(`Event ${code} not found for season ${season}`);
            }

            let apiAwards = [await getEventAwards(season, event.code)];
            apiAwards.forEach(fixJudgesChoice);
            let dbAwards = apiAwards
                .flat()
                .map((a) => Award.fromApi(season, a))
                .filter(notEmpty);
            await Award.save(dbAwards, { chunk: 100 });
            let adv = await getAdvancementSlots(season, event.code);
            if (!adv || adv.advancementSlots == null) {
                console.info(`No advancement info for ${event.code}`);
            } else {
                let dirty = false;
                if (event.advancementSlots !== adv.advancementSlots) {
                    event.advancementSlots = adv.advancementSlots;
                    dirty = true;
                }
                if (adv.advancesTo && event.advancesTo !== adv.advancesTo) {
                    event.advancesTo = adv.advancesTo;
                    dirty = true;
                }
                if (event.fcmpReserved !== adv.fcmpReserved) {
                    event.fcmpReserved = adv.fcmpReserved;
                    dirty = true;
                }
                if (dirty) {
                    await event.save();
                    console.info(
                        `Updated advancement info for ${event.code} -> slots=${adv.advancementSlots}, advancesTo=${adv.advancesTo}, fcmpReserved=${adv.fcmpReserved}`
                    );
                }
            }
            await computeAdvancementForEvent(season, code);
        }

        console.log(`Successfully computed advancement for season ${season}, event ${eventCode}`);
        process.exit(0);
    } catch (error) {
        console.error("Error computing advancement:", error);
        process.exit(1);
    }
}

function fixJudgesChoice(awards: AwardFtcApi[]) {
    // For some reason the api sometimes reports the judges choice award as starting from 0 instead of 1.
    // We correct that here.
    let hasZeroJudgesChoice = awards.some((a) => a.name == "Judges' Choice Award" && a.series == 0);
    if (hasZeroJudgesChoice) {
        awards.forEach((a) => {
            if (a.name == "Judges' Choice Award") a.series++;
        });
    }
}

main();
