import { SortDir, type NonRankStatColumn, type StatData, type StatSet } from "@ftc-scout/common";

export type Sort = { id: string; dir: SortDir };

function sortMixed(a: number | string, b: number | string): number {
    if (a == b) return 0;
    if (typeof a == "number" && typeof b == "number") return a < b ? -1 : 1;
    return ("" + a).localeCompare("" + b);
}

function sortFn<T>(sorter: NonRankStatColumn<T>, dir: SortDir): (a: T, b: T) => number {
    return (a, b) => {
        let av = sorter.getNonRankValueDistilled(a);
        let bv = sorter.getNonRankValueDistilled(b);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        let res = sortMixed(av, bv);
        return dir == SortDir.Asc ? res : -res;
    };
}

// Equal values share a rank; rows without the value get rank 0 and go last.
export function sortAndRank<T>(
    data: T[],
    stats: StatSet<T>,
    sort: Sort,
    defaultSort: Sort
): StatData<T>[] {
    let sorter = stats.getStat(sort.id) ?? stats.getStat(defaultSort.id);
    let sorted = [...data]
        .sort(sortFn(stats.getStat(defaultSort.id), defaultSort.dir))
        .sort(sortFn(sorter, sort.dir))
        .map((d) => ({
            filterRank: 0,
            filterSkipRank: 0,
            noFilterRank: 0,
            noFilterSkipRank: 0,
            data: d,
        }));

    let ranked = 0;
    let lastRank = 0;
    let lastValue: number | string | null = null;
    for (let row of sorted) {
        let v = sorter.getValueDistilled(row);
        if (v == null) continue;
        ranked++;
        if (lastRank == 0) lastRank = 1;
        else if (lastValue != v) lastRank = ranked;
        row.noFilterRank = row.filterRank = lastRank;
        lastValue = v;
    }
    return sorted;
}

// The default sort's column starts at the default, so tapping "Rank" puts the first team on top.
export function nextSort(current: Sort, id: string, defaultSort: Sort): Sort {
    if (current.id != id) return id == defaultSort.id ? defaultSort : { id, dir: SortDir.Desc };
    if (id == defaultSort.id)
        return { id, dir: current.dir == SortDir.Desc ? SortDir.Asc : SortDir.Desc };
    return current.dir == SortDir.Desc ? { id, dir: SortDir.Asc } : defaultSort;
}
