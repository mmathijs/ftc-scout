import { createStore, isPlainObject } from "./createStore";

export type FavoriteTeam = { number: number; name: string };
export type FavoriteEvent = {
    season: number;
    code: string;
    name: string;
    start: string;
    end: string;
};

export type Favorites = { teams: FavoriteTeam[]; events: FavoriteEvent[] };

const isText = (v: unknown): v is string => typeof v == "string";

export function loadFavorites(stored: unknown): Favorites {
    let s = isPlainObject(stored) ? stored : {};
    let list = (v: unknown) => (Array.isArray(v) ? v.filter(isPlainObject) : []);
    return {
        teams: list(s.teams).filter(
            (t) => Number.isInteger(t.number) && isText(t.name)
        ) as FavoriteTeam[],
        events: list(s.events).filter(
            (e) =>
                Number.isInteger(e.season) &&
                isText(e.code) &&
                isText(e.name) &&
                isText(e.start) &&
                isText(e.end)
        ) as FavoriteEvent[],
    };
}

export const favorites = createStore<Favorites>(
    "favorites",
    { teams: [], events: [] },
    { load: loadFavorites }
);

export function isFavoriteTeam(f: Favorites, number: number): boolean {
    return f.teams.some((t) => t.number == number);
}

export function isFavoriteEvent(f: Favorites, season: number, code: string): boolean {
    return f.events.some((e) => e.season == season && e.code == code);
}

export function toggleFavoriteTeam(team: FavoriteTeam) {
    favorites.set((f) => ({
        ...f,
        teams: isFavoriteTeam(f, team.number)
            ? f.teams.filter((t) => t.number != team.number)
            : [...f.teams, { number: team.number, name: team.name }].sort(
                  (a, b) => a.number - b.number
              ),
    }));
}

export function toggleFavoriteEvent(event: FavoriteEvent) {
    favorites.set((f) => ({
        ...f,
        events: isFavoriteEvent(f, event.season, event.code)
            ? f.events.filter((e) => !(e.season == event.season && e.code == event.code))
            : [
                  {
                      season: event.season,
                      code: event.code,
                      name: event.name,
                      start: event.start,
                      end: event.end,
                  },
                  ...f.events,
              ].sort((a, b) => b.start.localeCompare(a.start)),
    }));
}
