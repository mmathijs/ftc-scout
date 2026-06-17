import { EventTypeOption, Season, getEventTypes } from "@ftc-scout/common";
import { DataHasBeenLoaded } from "../entities/DataHasBeenLoaded";
import { Event } from "../entities/Event";
import { DATA_SOURCE } from "../data-source";
import { LoadType } from "../../ftc-api/watch";
import { getAlliances } from "../../ftc-api/get-alliances";
import { IS_DEV } from "../../constants";
import { exit } from "process";
import { AllianceSelection } from "../entities/AllianceSelection";

export async function loadAllAlliances(season: Season, loadType: LoadType) {
    console.info(`Loading alliances for season ${season}. (${loadType})`);

    let events = await eventsToFetch(season, loadType);

    console.info(`Got ${events.length} events to fetch.`);

    for (let i = 0; i < events.length; i++) {
        let event = events[i];

        // Remote events don't use alliance selection.
        if (event.remote) continue;

        try {
            let alliances = (await getAlliances(season, event.code)) ?? [];
            let dbAlliances = alliances
                .filter((a) => Number.isFinite(a.number))
                .map((a) => AllianceSelection.fromApi(a, season, event.code));

            await DATA_SOURCE.transaction(async (em) => {
                await em.delete(AllianceSelection, { season, eventCode: event.code });
                if (dbAlliances.length) {
                    await em.save(dbAlliances, { chunk: 100 });
                }
            });

            console.info(`Loaded ${i + 1}/${events.length}.`);
        } catch (e) {
            console.error(`Loaded ${i + 1}/${events.length} !!! ERROR !!!`);
            console.error(e);

            if (IS_DEV) {
                exit(1);
            }
        }
    }

    await DataHasBeenLoaded.create({
        season,
        alliances: true,
    }).save();

    console.info(`Finished loading alliances.`);
}

async function eventsToFetch(season: Season, loadType: LoadType) {
    let loaded = await DataHasBeenLoaded.alliancesHaveBeenLoaded(season);
    if (!loaded) {
        return Event.findBy({ season });
    }

    if (loadType == LoadType.Full) {
        return DATA_SOURCE.getRepository(Event)
            .createQueryBuilder("e")
            .select(["e.season", "e.code", "e.remote", "e.timezone"])
            .where("e.season = :season", { season })
            .andWhere("start < now()")
            .andWhere("start > 'now'::timestamp - '1 month'::interval")
            .andWhere("type IN (:...types)", { types: getEventTypes(EventTypeOption.Competition) })
            .getMany();
    }

    return DATA_SOURCE.getRepository(Event)
        .createQueryBuilder("e")
        .select(["e.season", "e.code", "e.remote", "e.timezone"])
        .where("season = :season", { season })
        .andWhere("start <= (NOW() at time zone timezone)::date")
        .andWhere(`"end" >= (NOW() at time zone timezone)::date`)
        .andWhere("type IN (:...types)", { types: getEventTypes(EventTypeOption.Competition) })
        .getMany();
}
