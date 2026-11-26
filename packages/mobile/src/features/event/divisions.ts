import { longestCommonPrefix } from "@ftc-scout/common";
import type { AwardType } from "@/api/generated/types";
import { sortAwardTypes } from "@/format";

type Related = { season: number; code: string; name: string };

export type Division = Related & {
    /** The event's name without the part all the related events share. */
    label: string;
};

// The event whose name is just the shared prefix is the "Finals Division".
export function divisions(eventName: string, related: Related[]): Division[] {
    let shared = longestCommonPrefix([eventName, ...related.map((e) => e.name)]);
    return [...related]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((e) => {
            let own = e.name.slice(shared.length).trim().replace(/-\s*/, "");
            return { ...e, label: own.length == 0 ? "Finals Division" : own };
        });
}

export function awardGroups<A extends { type: AwardType; divisionName: string | null }>(
    awards: A[]
): { type: AwardType; divisionName: string | null }[] {
    let seen = new Map<string, { type: AwardType; divisionName: string | null }>();
    for (let a of awards)
        seen.set(JSON.stringify([a.type, a.divisionName]), {
            type: a.type,
            divisionName: a.divisionName ?? null,
        });
    return [...seen.values()]
        .sort((a, b) => (a.divisionName ?? "").localeCompare(b.divisionName ?? ""))
        .sort((a, b) => sortAwardTypes(a.type, b.type));
}
