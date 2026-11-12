/**
 * Imports pit map json files (event code from the file name), npm run import-pit-maps -- <season> <file.json | dir>
 */
import dotenv from "dotenv";
import path from "path";
import { readFileSync, readdirSync, statSync } from "fs";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { ALL_SEASONS, Season } from "@ftc-scout/common";
import { DATA_SOURCE } from "../db/data-source";
import { initDynamicEntities } from "../db/entities/dyn/init";
import { Event } from "../db/entities/Event";
import { EventPitMap } from "../db/entities/EventPitMap";

function usage(msg?: string): never {
    if (msg) console.error(msg);
    console.error("usage: import-pit-maps <season> <file.json | dir> [...]");
    process.exit(1);
}

function jsonFiles(target: string): string[] {
    if (!statSync(target).isDirectory()) return [target];
    return readdirSync(target)
        .filter((f) => f.toLowerCase().endsWith(".json"))
        .map((f) => path.join(target, f));
}

async function main() {
    let [seasonArg, ...targets] = process.argv.slice(2);
    let season = +seasonArg as Season;
    if (!ALL_SEASONS.includes(season as any)) usage(`unknown season: ${seasonArg}`);
    if (!targets.length) usage("give at least one file or directory");

    await DATA_SOURCE.initialize();
    initDynamicEntities();

    let failures = 0;
    for (let file of targets.flatMap(jsonFiles)) {
        let eventCode = path
            .basename(file)
            .replace(/(_pitmap)?\.json$/i, "")
            .toUpperCase();
        try {
            let event = await Event.findOneBy({ season, code: eventCode });
            if (!event) throw new Error(`no ${season} event with code ${eventCode}`);

            let data = EventPitMap.parse(JSON.parse(readFileSync(file, "utf8")));
            await EventPitMap.save(EventPitMap.create({ season, eventCode, data }));

            let pits = data.elements.filter((e) => e.type == "PIT").length;
            let teams = data.elements.filter((e) => e.team).length;
            console.info(
                `${eventCode}: imported ${data.elements.length} elements, ${pits} pits, ${teams} teams`
            );
        } catch (e) {
            failures++;
            console.error(`${eventCode} (${file}): ${e instanceof Error ? e.message : e}`);
        }
    }

    await DATA_SOURCE.destroy();
    process.exit(failures ? 1 : 0);
}

main();
