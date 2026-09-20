import type { Season } from "@ftc-scout/common";
import type { PageLoad } from "./$types";
import { getData } from "$lib/graphql/getData";
import { getClient } from "$lib/graphql/client";
import { EpaPredictionStatsDocument } from "$lib/graphql/generated/graphql-operations";
import { STAT_DAYS_EC_DC, STAT_LEVEL_EC_DC, STAT_WINDOW_EC_DC } from "./stat-options";

export const load: PageLoad = ({ fetch, params, url }) => {
    let season = +params.season as Season;

    let level = STAT_LEVEL_EC_DC.decode(url.searchParams.get("stat-level"));
    let window = STAT_WINDOW_EC_DC.decode(url.searchParams.get("stat-window"));
    let windowDays = STAT_DAYS_EC_DC.decode(url.searchParams.get("stat-days"));

    let client = getClient(fetch);

    return {
        // Always fetches all three predictors - cheap (a season's worth of day-buckets is at
        // most a few hundred rows each) and lets the chart toggle which lines to show without
        // a refetch.
        epaPredictionStatsData: getData(client, EpaPredictionStatsDocument, {
            season,
            level,
            window,
            windowDays,
        }),
    };
};
