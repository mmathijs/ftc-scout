import type { StatColumn } from "@ftc-scout/common";

/** Room for "137.83". */
const MIN_CELL = 62;

export function units(stat: StatColumn<any>): number {
    return stat.ty == "team" || stat.ty == "event" ? 2.5 : 1;
}

// Leaves half a column showing at the edge when the stats don't all fit.
export function cellWidth(viewport: number, totalUnits: number): number {
    if (viewport <= 0 || totalUnits <= 0) return MIN_CELL;
    if (totalUnits * MIN_CELL <= viewport) return viewport / totalUnits;
    let whole = Math.max(1, Math.floor(viewport / MIN_CELL));
    return viewport / (whole + 0.5);
}

export function loadColumns(stored: unknown): string[] | null {
    return Array.isArray(stored) && stored.every((id) => typeof id == "string") ? stored : null;
}
