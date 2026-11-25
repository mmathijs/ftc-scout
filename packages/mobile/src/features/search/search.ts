import { calcCutoff, fuzzySearch, type FuzzyResult } from "@ftc-scout/common";
import type { SearchEvent, SearchTeam } from "@/api/hooks";

export type SearchResult = FuzzyResult<SearchTeam | SearchEvent>;

// Digits match team number prefixes; other text matches names, and event codes from four letters.
export function search(needle: string, events: SearchEvent[], teams: SearchTeam[]): SearchResult[] {
    needle = needle.trim().slice(0, 50);
    if (needle == "") return [];
    if (/^\d+$/.test(needle)) {
        return teams
            .filter((t) => (t.number + "").startsWith(needle))
            .sort((a, b) => a.number - b.number)
            .slice(0, 20)
            .map((t) => ({ document: t, distance: 0, highlights: [] }));
    }

    let es: SearchResult[] = fuzzySearch(events, needle, 12, "name", true);
    if (needle.length >= 4) {
        let lower = needle.toLowerCase();
        for (let e of events) {
            if (e.code.toLowerCase().startsWith(lower) && !es.some((r) => r.document == e)) {
                es.push({ document: e, distance: e.code.length - needle.length, highlights: [] });
            }
        }
    }
    let ts: SearchResult[] = fuzzySearch(teams, needle, 12, "name", true);

    let bestEvent = Math.min(...es.map((e) => e.distance));
    let bestTeam = Math.min(...ts.map((t) => t.distance));
    let cutoff = calcCutoff(Math.min(bestEvent, bestTeam), needle.length);
    let fe = es.filter((e) => e.distance <= cutoff);
    let ft = ts.filter((t) => t.distance <= cutoff);
    return bestTeam <= bestEvent ? [...ft, ...fe] : [...fe, ...ft];
}

export function highlightParts(
    text: string,
    highlights: number[]
): { text: string; hit: boolean }[] {
    if (!highlights.length) return [{ text, hit: false }];
    let set = new Set(highlights);
    let parts: { text: string; hit: boolean }[] = [];
    for (let i = 0; i < text.length; i++) {
        let hit = set.has(i);
        let last = parts[parts.length - 1];
        if (last && last.hit == hit) last.text += text[i];
        else parts.push({ text: text[i], hit });
    }
    return parts;
}
