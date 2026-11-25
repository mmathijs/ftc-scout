jest.mock("@/storage", () => ({ storage: require("@/storage.fake").fakeStorage() }));

import { QueryClient } from "@tanstack/react-query";
import { storage } from "@/storage";
import { cachedAt, writeCached } from "./cache";
import { API_ORIGIN } from "./config";
import { CombinedSearchDoc, EventPageDoc, HomePageDoc, TeamDoc } from "./generated/documents";
import { cacheKey, forgetSaved, pruneSaved, queryKey } from "./hooks";

const saved = () =>
    storage
        .keys()
        .filter((k) => k.startsWith("q:"))
        .map((k) => k.slice(2));

const team = (number: number) => cacheKey(TeamDoc, queryKey(TeamDoc, { number, season: 2025 }));
const event = (code: string) =>
    cacheKey(EventPageDoc, queryKey(EventPageDoc, { season: 2025, code }));
const search = cacheKey(CombinedSearchDoc, queryKey(CombinedSearchDoc, { season: 2025 }));
const home = cacheKey(HomePageDoc, queryKey(HomePageDoc, { season: 2025 }));

// No garbage collection, whose timers would keep the test running.
const newClient = () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });

async function save(...keys: string[]) {
    for (let key of keys) expect(await writeCached(key, { n: 1 })).toBe(true);
}

describe("saved answers", () => {
    beforeEach(() => {
        for (let k of storage.keys()) if (k.startsWith("q:")) storage.remove(k);
        pruneSaved();
    });

    it("are told apart by query, variables, the query's text and the server", () => {
        let other = { ...TeamDoc, hash: "f".repeat(64) };
        let key = queryKey(TeamDoc, { number: 3954, season: 2025 });
        expect(cacheKey(TeamDoc, key)).not.toBe(cacheKey(other, key));
        expect(team(3954)).not.toBe(team(16461));
        expect(cacheKey(TeamDoc, key)).toContain(JSON.stringify(API_ORIGIN));
    });

    it("are pruned when no query of this build reads them", async () => {
        let changed = cacheKey({ ...TeamDoc, hash: "f".repeat(64) }, ["Team", { number: 1 }]);
        let otherServer = team(1).replace(JSON.stringify(API_ORIGIN), '"http://localhost:4000"');
        let olderFormat = `${TeamDoc.hash.slice(0, 12)}:["Team",{"number":1,"season":2025}]`;
        await save(team(1), changed, otherServer, olderFormat);
        pruneSaved();
        expect(saved()).toEqual([team(1)]);
    });

    it("are forgotten for a team's page: only that team's", async () => {
        let client = newClient();
        client.setQueryData(queryKey(TeamDoc, { number: 1, season: 2025 }), { n: 1 });
        client.setQueryData(queryKey(TeamDoc, { number: 2, season: 2025 }), { n: 2 });
        await save(team(1), team(2), search);
        forgetSaved(client, "team/[number]", { number: "1" });
        expect(saved().sort()).toEqual([team(2), search].sort());
        expect(cachedAt(team(1))).toBeUndefined();
        expect(client.getQueryData(queryKey(TeamDoc, { number: 1, season: 2025 }))).toBeUndefined();
        expect(client.getQueryData(queryKey(TeamDoc, { number: 2, season: 2025 }))).toBeDefined();
    });

    it("are forgotten for an event's page: only that event's", async () => {
        await save(event("NLCMP"), event("USCMP"), team(1));
        forgetSaved(newClient(), "event/[season]/[code]", { season: "2025", code: "NLCMP" });
        expect(saved().sort()).toEqual([event("USCMP"), team(1)].sort());
    });

    it("are forgotten for a list: only what it shows, so the search data stays for Home", async () => {
        await save(home, search, team(1), event("NLCMP"));
        forgetSaved(newClient(), "index", {});
        expect(saved().sort()).toEqual([search, team(1), event("NLCMP")].sort());
        forgetSaved(newClient(), "teams", {});
        expect(saved().sort()).toEqual([team(1), event("NLCMP")].sort());
        forgetSaved(newClient(), "favorites", {});
        expect(saved()).toHaveLength(2);
    });
});
