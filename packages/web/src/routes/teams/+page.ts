import { browser } from "$app/environment";
import { derived, get, readable } from "svelte/store";
import { getClient } from "../../lib/graphql/client";
import {
    RegionOption as RegionOptionGQL,
    TeamsRegionSearchDocument,
} from "../../lib/graphql/generated/graphql-operations";
import { getData, getDataSync } from "../../lib/graphql/getData";
import { REGION_EC_DC } from "../../lib/util/search-params/region";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, url }) => {
    let region = REGION_EC_DC.decode(url.searchParams.get("regions")) as RegionOptionGQL | null;
    if (region == RegionOptionGQL.All) region = null;

    let client = getClient(fetch);

    // SSR page only renders first 100 teams, later loads the rest.
    let all = browser
        ? getDataSync(client, TeamsRegionSearchDocument, { region }, "teams-page")
        : null;
    if (all && get(all)) return { teams: all };

    // A search needs all of them (it's done in the browser), so that page waits for them.
    let first = url.searchParams.get("search")
        ? readable(null)
        : await getData(client, TeamsRegionSearchDocument, { region, limit: 100 });

    return { teams: all ? derived([all, first], ([$all, $first]) => $all ?? $first) : first };
};
