import { ALL_SEASONS, CURRENT_SEASON, type Season } from "@ftc-scout/common";
import { createStore, isPlainObject } from "./createStore";

export type ThemePreference = "system" | "light" | "dark";

export type TableView = "cards" | "table";

export type Settings = {
    theme: ThemePreference;
    tableView: TableView;
    /** null while following the current season, so the app moves on when the next one starts. */
    pickedSeason: Season | null;
    season: Season;
    recentSearches: string[];
};

const MAX_RECENT = 8;

const THEMES: ThemePreference[] = ["system", "light", "dark"];
const TABLE_VIEWS: TableView[] = ["cards", "table"];

// Older versions stored `season` on every change, so this value doesn't mean it was picked.
const SEASON_OF_OLD_FORMAT = 2026;

function asSeason(v: unknown): Season | null {
    return (ALL_SEASONS as readonly unknown[]).includes(v) ? (v as Season) : null;
}

function withSeason(s: Omit<Settings, "season">): Settings {
    return { ...s, season: s.pickedSeason ?? CURRENT_SEASON };
}

export function loadSettings(stored: unknown): Settings {
    let s = isPlainObject(stored) ? stored : {};
    let picked =
        "pickedSeason" in s
            ? asSeason(s.pickedSeason)
            : s.season !== SEASON_OF_OLD_FORMAT
            ? asSeason(s.season)
            : null;
    return withSeason({
        // Kept, so that saving doesn't drop what a newer version of the app stored.
        ...s,
        theme: THEMES.find((t) => t === s.theme) ?? "system",
        tableView: TABLE_VIEWS.find((t) => t === s.tableView) ?? "cards",
        pickedSeason: picked == CURRENT_SEASON ? null : picked,
        recentSearches: Array.isArray(s.recentSearches)
            ? s.recentSearches.filter((r): r is string => typeof r == "string").slice(0, MAX_RECENT)
            : [],
    });
}

export const settings = createStore<Settings>("settings", loadSettings(null), {
    load: loadSettings,
    save: ({ season, ...stored }) => stored,
});

export function setTheme(theme: ThemePreference) {
    settings.set((s) => ({ ...s, theme }));
}

export function setTableView(tableView: TableView) {
    settings.set((s) => ({ ...s, tableView }));
}

export function setSeason(season: Season) {
    settings.set((s) =>
        withSeason({ ...s, pickedSeason: season == CURRENT_SEASON ? null : asSeason(season) })
    );
}

export function addRecentSearch(text: string) {
    let t = text.trim();
    if (!t) return;
    settings.set((s) => ({
        ...s,
        recentSearches: [
            t,
            ...s.recentSearches.filter((r) => r.toLowerCase() != t.toLowerCase()),
        ].slice(0, MAX_RECENT),
    }));
}

export function clearRecentSearches() {
    settings.set((s) => ({ ...s, recentSearches: [] }));
}
