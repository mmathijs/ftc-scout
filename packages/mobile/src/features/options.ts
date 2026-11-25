import {
    ALL_SEASONS,
    DESCRIPTORS,
    type EventTypeOption,
    type RegionOption,
    type Season,
} from "@ftc-scout/common";
import type { Option } from "@/components/Select";
import {
    COMP_EVENT_TY_GROUPS,
    EVENT_TY_GROUPS,
    eventTyNames,
    REGION_GROUPS,
    regionName,
} from "@/format";

export const SEASON_OPTIONS: Option<Season>[][] = [
    [...ALL_SEASONS].reverse().map((s) => ({ value: s, label: DESCRIPTORS[s].seasonNameWithYear })),
];

export function seasonOptions(seasons: number[]): Option<Season>[][] {
    let set = new Set(seasons);
    return [SEASON_OPTIONS[0].filter((o) => set.has(o.value))];
}

export const REGION_OPTIONS: Option<RegionOption>[][] = REGION_GROUPS.map((g) =>
    [...g].map((r) => ({ value: r as RegionOption, label: regionName(r as RegionOption) }))
);

export const ALL_EVENT_TYPE_OPTIONS: Option<EventTypeOption>[][] = EVENT_TY_GROUPS.map((g) =>
    [...g].map((t) => ({ value: t as EventTypeOption, label: eventTyNames(t as EventTypeOption) }))
);

/** Competition types only, for the records, which only competitions have. */
export const EVENT_TYPE_OPTIONS: Option<EventTypeOption>[][] = COMP_EVENT_TY_GROUPS.map((g) =>
    [...g].map((t) => ({
        value: t as EventTypeOption,
        label: eventTyNames(t as EventTypeOption, true),
    }))
);
