jest.mock("@/storage", () => ({ storage: require("@/storage.fake").fakeStorage() }));

import { CURRENT_SEASON } from "@ftc-scout/common";
import { storage } from "@/storage";
import { loadSettings } from "./settings";

const DEFAULTS = {
    theme: "system",
    tableView: "cards",
    pickedSeason: null,
    season: CURRENT_SEASON,
    recentSearches: [],
};

function start(stored?: string): typeof import("./settings") {
    (storage as any).data.clear();
    if (stored != undefined) (storage as any).data.set("settings", stored);
    let mod: typeof import("./settings");
    jest.isolateModules(() => (mod = require("./settings")));
    return mod!;
}

const stored = () => JSON.parse(storage.get("settings")!);

describe("loadSettings", () => {
    it("gives the defaults for nothing, and for what is no settings object", () => {
        for (let v of [null, undefined, "x", 5, true, [], [1]]) {
            expect(loadSettings(v)).toEqual(DEFAULTS);
        }
    });

    it("falls back, field by field, on what it does not know", () => {
        expect(
            loadSettings({
                theme: "pink",
                tableView: 3,
                pickedSeason: "2025",
                recentSearches: "robots",
            })
        ).toEqual(DEFAULTS);
        expect(loadSettings({ pickedSeason: 1999 }).season).toBe(CURRENT_SEASON);
        expect(loadSettings({ theme: "dark", tableView: "table" })).toEqual({
            ...DEFAULTS,
            theme: "dark",
            tableView: "table",
        });
    });

    it("keeps only the searches that are text", () => {
        expect(loadSettings({ recentSearches: ["a", 5, null, "b", {}] }).recentSearches).toEqual([
            "a",
            "b",
        ]);
    });

    it("keeps a season the person picked", () => {
        let s = loadSettings({ pickedSeason: 2024 });
        expect([s.pickedSeason, s.season]).toEqual([2024, 2024]);
    });

    it("reads the older format: its season was a choice unless it was the one current then", () => {
        expect(loadSettings({ theme: "dark", season: 2026 })).toEqual({
            ...DEFAULTS,
            theme: "dark",
        });
        expect(loadSettings({ season: 2024 }).pickedSeason).toBe(2024);
        expect(loadSettings({ season: "2024" }).season).toBe(CURRENT_SEASON);
        expect(loadSettings({ season: 1999 }).season).toBe(CURRENT_SEASON);
    });
});

describe("settings", () => {
    it("does not pin the season when something else is changed", () => {
        let { settings, setTheme, setTableView, addRecentSearch } = start();
        setTheme("dark");
        setTableView("table");
        addRecentSearch("3954");
        expect(stored()).toEqual({
            theme: "dark",
            tableView: "table",
            pickedSeason: null,
            recentSearches: ["3954"],
        });
        expect(settings.get().season).toBe(CURRENT_SEASON);
    });

    it("stores a picked season, and follows the current one again when that is picked", () => {
        let { settings, setSeason } = start();
        setSeason(2024);
        expect(stored().pickedSeason).toBe(2024);
        expect(settings.get().season).toBe(2024);
        expect(start(storage.get("settings")!).settings.get().season).toBe(2024);

        setSeason(CURRENT_SEASON);
        expect(stored().pickedSeason).toBe(null);
        expect(settings.get().season).toBe(CURRENT_SEASON);
    });

    it("starts with defaults over a damaged value, and can be changed after", () => {
        for (let bad of ['"x"', "5", "{broken", "null", "[]"]) {
            let { settings, setTheme } = start(bad);
            expect(settings.get()).toEqual(DEFAULTS);
            setTheme("light");
            expect(settings.get().theme).toBe("light");
        }
    });

    it("keeps what it doesn't know, so a newer version's setting outlives a change", () => {
        let { setTheme } = start('{"theme":"dark","compact":true}');
        setTheme("light");
        expect(stored()).toMatchObject({ theme: "light", compact: true });
    });

    it("never hands a reader a season the app has no descriptor for", () => {
        let s = start('{"season":"2025","pickedSeason":2031,"recentSearches":{"0":"x"}}').settings;
        expect(s.get()).toEqual(DEFAULTS);
    });
});
