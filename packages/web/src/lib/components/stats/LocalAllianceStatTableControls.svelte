<script lang="ts" context="module">
    type State = {
        shownStats: Writable<NonRankStatColumn<any>[]>;
        currentSort: Writable<{ id: string; dir: SortDir }>;
        filter: Writable<FilterGroup | null>;
        rankTy: Writable<RankTy>;
    };
    let savedState: Record<string, State> = {};

    function getSavedState(
        saveId: string,
        stats: StatSet<any>,
        defaultStats: string[],
        defaultSort: { id: string; dir: SortDir }
    ): State {
        if (!(saveId in savedState)) {
            savedState[saveId] = {
                shownStats: writable(
                    defaultStats.flatMap((s) => {
                        const stat = stats.getStat(s);
                        return stat ? [stat] : [];
                    })
                ),
                currentSort: writable(defaultSort),
                filter: writable(null),
                rankTy: writable(RankTy.NoFilter),
            };
        }

        return savedState[saveId];
    }
</script>

<script lang="ts">
    import { applyFilter } from "./filter/applyFilters";
    import { arrayMove } from "../../util/array";
    import { cycleSortDir, cycleSortDirNoNull } from "./SortButton.svelte";
    import { sortMixed } from "../../util/sorters";
    import {
        RankTy,
        NonRankStatColumn,
        StatSet,
        StatSetSection,
        type StatData,
        SortDir,
        type FilterGroup,
        RANK_STATS,
        StatType,
        Color,
    } from "@ftc-scout/common";
    import { writable, type Writable } from "svelte/store";
    import { faEdit, faFilter, faXmark } from "@fortawesome/free-solid-svg-icons";
    import ChooseStatsModal from "./choose-stats/ChooseStatsModal.svelte";
    import Button from "../ui/Button.svelte";
    import FilterModal from "./filter/FilterModal.svelte";
    import Select from "../ui/form/Select.svelte";
    import ExportCsv from "./ExportCsv.svelte";
    import AllianceStatTable from "./AllianceStatTable.svelte";

    type T = $$Generic;

    type AllianceProp = {
        number: number;
        name?: string | null;
        captainTeamNumber?: number | null;
        round1TeamNumber?: number | null;
        round2TeamNumber?: number | null;
        round3TeamNumber?: number | null;
    };

    // AllianceRow spreads all T fields plus alliance metadata
    type AllianceRow = {
        _allianceNumber: number;
        _allianceName: string;
        _teams: Array<{ number: number; name: string }>;
    } & Record<string, any>;

    export let saveId: string;
    export let data: T[];
    export let stats: StatSet<T>;
    export let focusedTeam: number | null;
    export let defaultStats: string[];
    export let defaultSort: { id: string; dir: SortDir };
    export let hideRankStats: string[] = [];
    export let csv: { filename: string; title: string };
    export let alliances: AllianceProp[];

    function buildAllianceStatSet(
        originalStats: StatSet<any>,
        numTeams: number
    ): StatSet<AllianceRow> {
        const allianceStat = new NonRankStatColumn<AllianceRow>({
            id: "alliance",
            columnName: "Alliance",
            dialogName: "Alliance",
            titleName: "Alliance",
            sqlExpr: "",
            color: Color.White,
            ty: StatType.String,
            getNonRankValue: (d) => ({ ty: "string", val: d._allianceName }),
        });

        const teamStats = Array.from({ length: numTeams }, (_, i) => {
            const stat = new NonRankStatColumn<AllianceRow>({
                id: `team${i + 1}`,
                columnName: `Team ${i + 1}`,
                dialogName: `Team ${i + 1}`,
                titleName: `Team ${i + 1}`,
                sqlExpr: "",
                color: Color.White,
                ty: StatType.Team,
                getNonRankValue: (d) => {
                    const team = d._teams[i];
                    return team
                        ? { ty: "team" as const, number: team.number, name: team.name }
                        : null;
                },
            });
            // StatType.Team would make shouldExpand() return true, causing uneven header widths
            stat.shouldExpand = () => false;
            return stat;
        });

        const adaptedStats: NonRankStatColumn<AllianceRow>[] = originalStats.allStats
            .filter((s: any) => s.id !== "team")
            .map(
                (s: any) =>
                    new NonRankStatColumn<AllianceRow>({
                        id: s.id,
                        columnName: s.id === "rankingScore" ? "CS" : s.columnName,
                        dialogName: s.dialogName,
                        titleName: s.titleName,
                        sqlExpr: s.sqlExpr,
                        color: s.color,
                        ty: s.ty,
                        getNonRankValue: (d: AllianceRow) => s.getNonRankValue(d),
                    })
            );

        const allianceInfoSection = new StatSetSection(
            "Alliance",
            [
                { val: { id: "alliance", name: "Alliance" }, children: [] },
                ...Array.from({ length: numTeams }, (_, i) => ({
                    val: { id: `team${i + 1}`, name: `Team ${i + 1}` },
                    children: [],
                })),
            ],
            [{ id: "", name: "", color: Color.White, description: null }]
        );

        const adaptedSections: StatSetSection[] = originalStats.sections.map((section: any) =>
            section.name === "Team's Event Performance"
                ? new StatSetSection(
                      section.name,
                      (section.rows as any[]).filter((row: any) => row.val?.id !== "team"),
                      section.columns
                  )
                : section
        );

        return new StatSet<AllianceRow>(
            `alliance_${originalStats.id}`,
            [allianceStat, ...teamStats, ...adaptedStats],
            [allianceInfoSection, ...adaptedSections]
        );
    }

    function buildAllianceData(inputData: T[], inputAlliances: AllianceProp[]): AllianceRow[] {
        const teamToAlliance = new Map<number, number>();
        for (const a of inputAlliances) {
            if (a.captainTeamNumber != null) teamToAlliance.set(a.captainTeamNumber, a.number);
            if (a.round1TeamNumber != null) teamToAlliance.set(a.round1TeamNumber, a.number);
            if (a.round2TeamNumber != null) teamToAlliance.set(a.round2TeamNumber, a.number);
            if (a.round3TeamNumber != null) teamToAlliance.set(a.round3TeamNumber, a.number);
        }

        const teamStat = stats.getStat("team");
        const teamInfo = new Map<number, { number: number; name: string }>();
        const allianceRep = new Map<number, T>();

        for (const d of inputData) {
            const val = teamStat?.getNonRankValue(d);
            if (!val || val.ty !== "team") continue;
            teamInfo.set(val.number, { number: val.number, name: val.name });
            const allianceNum = teamToAlliance.get(val.number);
            if (allianceNum != null && !allianceRep.has(allianceNum)) {
                allianceRep.set(allianceNum, d);
            }
        }

        return inputAlliances
            .filter((a) => allianceRep.has(a.number))
            .map((a) => {
                const rep = allianceRep.get(a.number)!;
                const teams = (
                    [
                        a.captainTeamNumber,
                        a.round1TeamNumber,
                        a.round2TeamNumber,
                        a.round3TeamNumber,
                    ] as (number | null | undefined)[]
                )
                    .filter((n): n is number => n != null)
                    .map((n) => teamInfo.get(n))
                    .filter((t): t is { number: number; name: string } => t != null);

                return {
                    ...(rep as any),
                    _allianceNumber: a.number,
                    _allianceName: a.name ?? `Alliance ${a.number}`,
                    _teams: teams,
                } as AllianceRow;
            });
    }

    // Compute once at component initialization (alliances don't change after load)
    const maxTeams =
        alliances.length === 0
            ? 2
            : Math.max(
                  ...alliances.map(
                      (a) =>
                          [
                              a.captainTeamNumber,
                              a.round1TeamNumber,
                              a.round2TeamNumber,
                              a.round3TeamNumber,
                          ].filter((n) => n != null).length
                  )
              );
    const allianceStatSet = buildAllianceStatSet(stats, maxTeams);
    const allianceSaveId = saveId + "_alliance";
    const allianceDefaultStats = defaultStats.flatMap((s) =>
        s === "team"
            ? ["alliance", ...Array.from({ length: maxTeams }, (_, i) => `team${i + 1}`)]
            : [s]
    );

    let { shownStats, currentSort, filter, rankTy } = getSavedState(
        allianceSaveId,
        allianceStatSet,
        allianceDefaultStats,
        defaultSort
    );

    function calcIsDefaultStats(curr: NonRankStatColumn<any>[]): boolean {
        const validDef = allianceDefaultStats.filter((s) => allianceStatSet.getStat(s) != null);
        if (validDef.length != curr.length) return false;
        for (let i = 0; i < validDef.length; i++) {
            if (validDef[i] != curr[i].id) return false;
        }
        return true;
    }

    $: isDefaultStats = calcIsDefaultStats($shownStats);

    function changeSort(id: string) {
        let oldDir = $currentSort.id == id ? $currentSort.dir : null;
        let newDir = id == defaultSort.id ? cycleSortDirNoNull(oldDir) : cycleSortDir(oldDir);
        $currentSort = newDir == null ? defaultSort : { id, dir: newDir };
    }

    function moveColumn(from: number, to: number) {
        $shownStats = arrayMove($shownStats, from, to);
    }

    function toggleShowStat(id: string) {
        if ($shownStats.some((s) => s.id == id)) {
            $shownStats = $shownStats.filter((s) => s.id != id);
        } else {
            const stat = allianceStatSet.getStat(id);
            if (stat) $shownStats = [...$shownStats, stat];
        }
    }

    function assignRanks(
        ranked: StatData<AllianceRow>[],
        sorter: NonRankStatColumn<AllianceRow>,
        preFilter: boolean
    ) {
        const field = preFilter ? "noFilterRank" : "filterRank";
        let rankedCount = 0;
        let lastRank = 0;
        let lastValue: number | string | null = null;

        for (let i = 0; i < ranked.length; i++) {
            let thisVal = sorter.getValueDistilled(ranked[i]);
            if (thisVal == null) {
                ranked[i][field] = 0;
                continue;
            }
            rankedCount++;
            if (lastRank == 0) {
                lastRank = 1;
            } else if (lastValue != thisVal) {
                lastRank = rankedCount;
            }
            ranked[i][field] = lastRank;
            lastValue = thisVal;
        }
    }

    function statSortFn(
        sorter: NonRankStatColumn<AllianceRow>,
        dir: SortDir
    ): (a: AllianceRow, b: AllianceRow) => number {
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

    function sortAndRank(
        inputData: AllianceRow[],
        sorter: NonRankStatColumn<AllianceRow>,
        dir: SortDir,
        filterVal: FilterGroup | null
    ): StatData<AllianceRow>[] {
        const defaultSortStat = allianceStatSet.getStat(defaultSort.id);
        let sorted = inputData
            .sort(defaultSortStat ? statSortFn(defaultSortStat, defaultSort.dir) : () => 0)
            .sort(statSortFn(sorter, dir))
            .map((s) => ({
                filterRank: 0,
                filterSkipRank: 0,
                noFilterRank: 0,
                noFilterSkipRank: 0,
                data: s,
            }));
        assignRanks(sorted, sorter, true);

        let filtered = applyFilter(sorted, allianceStatSet as any, filterVal);
        assignRanks(filtered, sorter, false);

        return filtered;
    }

    $: allianceData = buildAllianceData(data, alliances);
    $: rankedData = sortAndRank(
        allianceData,
        allianceStatSet.getStat($currentSort.id) ?? allianceStatSet.getStat(defaultSort.id),
        $currentSort.dir,
        $filter
    );

    $: rankingByEquiv = hideRankStats.indexOf($currentSort.id) != -1;
    $: rowsDroppedByFilter = rankedData.length != allianceData.length;
    $: showRank = !rankingByEquiv || (rowsDroppedByFilter && $rankTy != RankTy.NoFilter);

    let chooseStatsModalShown = false;
    let filtersShown = false;

    let skip: "skip" | "keep";
    let rankAfterFilters: "yes" | "no";

    function updateRankComponents(t: RankTy) {
        skip = t == RankTy.FilterSkip || t == RankTy.NoFilterSkip ? "skip" : "keep";
        rankAfterFilters = t == RankTy.Filter || t == RankTy.FilterSkip ? "yes" : "no";
    }

    function computeRankTy(s: "skip" | "keep", f: "yes" | "no") {
        if (f == "yes") {
            $rankTy = s == "skip" ? RankTy.FilterSkip : RankTy.Filter;
        } else {
            $rankTy = s == "skip" ? RankTy.NoFilterSkip : RankTy.NoFilter;
        }
    }

    $: updateRankComponents($rankTy);
    $: computeRankTy(skip, rankAfterFilters);
</script>

<ChooseStatsModal
    bind:shown={chooseStatsModalShown}
    selectedStats={$shownStats.map((s) => s.id)}
    stats={allianceStatSet}
    on:choose-stat={(e) => toggleShowStat(e.detail)}
/>
<FilterModal
    bind:shown={filtersShown}
    root={$filter}
    stats={allianceStatSet}
    on:new-filter={(e) => ($filter = e.detail)}
/>

<div class="controls" class:extras={!isDefaultStats || $filter != null}>
    <Button icon={faEdit} on:click={() => (chooseStatsModalShown = true)}>Statistics</Button>
    {#if !isDefaultStats}
        <Button
            icon={faXmark}
            on:click={() =>
                ($shownStats = allianceDefaultStats
                    .filter((s) => allianceStatSet.getStat(s) != null)
                    .map((s) => allianceStatSet.getStat(s)))}>Reset Stats</Button
        >
    {/if}

    <Button icon={faFilter} on:click={() => (filtersShown = true)}>Filters</Button>

    {#if $filter != null}
        <Button icon={faXmark} on:click={() => ($filter = null)}>Clear Filters</Button>
        <Select
            bind:value={rankAfterFilters}
            options={[
                { value: "no", name: "Pre Filter Rank" },
                { value: "yes", name: "Post Filter Rank" },
            ]}
        />
    {/if}

    <div>
        <ExportCsv data={rankedData} shownStats={$shownStats} {csv} />
    </div>
</div>

<AllianceStatTable
    data={rankedData}
    stats={$shownStats}
    currentSort={$currentSort}
    {focusedTeam}
    rankStat={showRank ? RANK_STATS[$rankTy] : null}
    on:change_sort={(e) => changeSort(e.detail)}
    on:move_column={(e) => moveColumn(e.detail.oldPos, e.detail.newPos)}
/>

<style>
    .controls {
        display: flex;
        align-items: center;
        justify-content: left;
        flex-wrap: wrap;
        gap: var(--md-gap);
        margin-bottom: var(--lg-gap);
    }

    .controls :last-child {
        margin-left: auto;
    }

    @media (max-width: 600px) {
        .controls.extras :last-child {
            margin-left: 0;
        }
    }

    .controls :global(select) {
        width: min-content;
        padding-top: calc(var(--md-pad) * 0.9);
        padding-bottom: calc(var(--md-pad) * 0.9);
        background-color: var(--form-bg-color);
    }

    .controls :global(select:hover) {
        background-color: var(--form-hover-bg-color);
    }
</style>
