jest.mock("@/storage", () => ({ storage: require("@/storage.fake").fakeStorage() }));

import { storage } from "@/storage";
import { loadFavorites } from "./favorites";

function start(stored?: string): typeof import("./favorites") {
    (storage as any).data.clear();
    if (stored != undefined) (storage as any).data.set("favorites", stored);
    let mod: typeof import("./favorites");
    jest.isolateModules(() => (mod = require("./favorites")));
    return mod!;
}

const stored = () => JSON.parse(storage.get("favorites")!);

describe("favorites", () => {
    it("adds and removes a team, sorted by number, and stores it", () => {
        let { favorites, isFavoriteTeam, toggleFavoriteTeam } = start();
        toggleFavoriteTeam({ number: 16461, name: "Infinite Turtles" });
        toggleFavoriteTeam({ number: 3954, name: "Pink to the Future" });
        expect(favorites.get().teams.map((t) => t.number)).toEqual([3954, 16461]);
        expect(isFavoriteTeam(favorites.get(), 16461)).toBe(true);
        expect(stored().teams).toHaveLength(2);

        toggleFavoriteTeam({ number: 16461, name: "Infinite Turtles" });
        expect(isFavoriteTeam(favorites.get(), 16461)).toBe(false);
        expect(stored().teams).toEqual([{ number: 3954, name: "Pink to the Future" }]);
    });

    it("tells events of different seasons with the same code apart, newest first", () => {
        let { favorites, isFavoriteEvent, toggleFavoriteEvent } = start();
        let e = {
            code: "NLCMP",
            name: "Benelux Championship",
            start: "2026-02-07",
            end: "2026-02-07",
        };
        toggleFavoriteEvent({ ...e, season: 2025 });
        toggleFavoriteEvent({ ...e, season: 2024, start: "2025-02-08", end: "2025-02-08" });
        expect(isFavoriteEvent(favorites.get(), 2025, "NLCMP")).toBe(true);
        expect(isFavoriteEvent(favorites.get(), 2023, "NLCMP")).toBe(false);
        expect(favorites.get().events.map((x) => x.season)).toEqual([2025, 2024]);
        toggleFavoriteEvent({ ...e, season: 2025 });
        expect(favorites.get().events.map((x) => x.season)).toEqual([2024]);
    });

    it("reads what an earlier version stored", () => {
        let team = { number: 3954, name: "Pink to the Future" };
        let { favorites } = start(JSON.stringify({ teams: [team], events: [] }));
        expect(favorites.get().teams).toEqual([team]);
    });

    it("reads only what the lists can draw from a damaged or foreign value", () => {
        let team = { number: 3954, name: "Pink to the Future" };
        expect(loadFavorites("x")).toEqual({ teams: [], events: [] });
        expect(loadFavorites({ teams: "x", events: 5 })).toEqual({ teams: [], events: [] });
        expect(
            loadFavorites({ teams: [team, null, { number: "7", name: "x" }], events: [{}] })
        ).toEqual({ teams: [team], events: [] });
        expect(start("{broken").favorites.get()).toEqual({ teams: [], events: [] });
    });
});
