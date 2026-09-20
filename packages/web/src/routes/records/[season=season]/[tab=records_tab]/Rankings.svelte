<script lang="ts">
    import { page } from "$app/stores";
    import SkeletonRow from "$lib/components/skeleton/SkeletonRow.svelte";
    import StatTable from "$lib/components/stats/StatTable.svelte";
    import { cycleSortDirNoNull } from "$lib/components/stats/SortButton.svelte";
    import PageChooser from "$lib/components/PageChooser.svelte";
    import { queryParam } from "$lib/util/search-params/search-params";
    import { PAGE_EC_DC } from "$lib/util/search-params/int";
    import {
        Color,
        NonRankStatColumn,
        RankTy,
        RANK_STATS,
        SortDir,
        StatType,
        type Season,
        type StatData,
    } from "@ftc-scout/common";
    import { RankingMetric, RANKING_METRIC_EC_DC } from "./ranking-options";
    import { PAGE_SIZE } from "./+page.svelte";
    import type { PageData } from "./$types";

    const SORT_DIR_EC_DC = {
        encode: (d: SortDir) => (d == SortDir.Desc ? null : d),
        decode: (s: string | null): SortDir => (s == SortDir.Asc ? SortDir.Asc : SortDir.Desc),
    };

    type Row = {
        rank: number;
        matchesPlayed: number;
        epa?: number;
        opr?: number;
        team: { number: number; name: string };
    };

    $: season = +$page.params.season as Season;
    export let rankingsData: PageData["rankingsData"];
    export let focusedTeam: number | null = null;

    // $rankingsData holds whichever of EpaRecordsQuery/OprRecordsQuery was actually fetched (see
    // +page.ts) - only one of these two fields is ever present at once.
    function pickRecords(data: Record<string, any> | undefined | null) {
        return data ? data.epaRecords ?? data.oprRecords : undefined;
    }
    $: info = pickRecords($rankingsData?.data);
    $: rows = info?.data as Row[] | undefined;

    let metric = queryParam("metric", RANKING_METRIC_EC_DC);
    let sortDir = queryParam("sort-dir", SORT_DIR_EC_DC);
    let pageNum = queryParam("page", PAGE_EC_DC);
    $: pageCount = info ? Math.max(1, Math.ceil(info.count / PAGE_SIZE)) : 1;

    // Both EPA and OPR are always shown, but only one at a time actually drives the server-side
    // sort/pagination (they live in separate tables) - clicking either column's sort arrow makes
    // it the active one, same as clicking the "Rank by" buttons below.
    function changeSort(id: string) {
        if (id != "epa" && id != "opr") return; // Team/Matches have no server-side ordering.
        rankBy(id == "opr" ? RankingMetric.Opr : RankingMetric.Epa);
    }

    function rankBy(m: RankingMetric) {
        $pageNum = 1;
        if ($metric == m) {
            $sortDir = cycleSortDirNoNull($sortDir);
        } else {
            $metric = m;
            $sortDir = SortDir.Desc;
        }
    }

    $: currentSortId = $metric == RankingMetric.Opr ? "opr" : "epa";

    const teamColumn = new NonRankStatColumn<Row>({
        id: "team",
        columnName: "Team",
        dialogName: "Team",
        titleName: "Team",
        sqlExpr: "team",
        color: Color.White,
        ty: StatType.Team,
        getNonRankValue: (r) => ({ ty: "team", number: r.team.number, name: r.team.name }),
    });

    const epaColumn = new NonRankStatColumn<Row>({
        id: "epa",
        columnName: "EPA",
        dialogName: "EPA",
        titleName: "EPA",
        sqlExpr: "epa",
        color: Color.Blue,
        ty: StatType.Float,
        getNonRankValue: (r) => (r.epa == null ? null : { ty: "float", val: r.epa }),
    });

    const oprColumn = new NonRankStatColumn<Row>({
        id: "opr",
        columnName: "OPR",
        dialogName: "OPR",
        titleName: "OPR",
        sqlExpr: "opr",
        color: Color.Purple,
        ty: StatType.Float,
        getNonRankValue: (r) => (r.opr == null ? null : { ty: "float", val: r.opr }),
    });

    const matchesColumn = new NonRankStatColumn<Row>({
        id: "matchesPlayed",
        columnName: "Matches",
        dialogName: "Matches Played",
        titleName: "Matches Played",
        sqlExpr: "matchesPlayed",
        color: Color.Green,
        ty: StatType.Int,
        getNonRankValue: (r) => ({ ty: "int", val: r.matchesPlayed }),
    });

    const statColumns = [teamColumn, epaColumn, oprColumn, matchesColumn];
    $: statData = (rows ?? []).map(
        (r): StatData<Row> => ({
            noFilterRank: r.rank,
            filterRank: r.rank,
            noFilterSkipRank: r.rank,
            filterSkipRank: r.rank,
            data: r,
        })
    );
</script>

<div class="metric-row">
    <span class="metric-label">Rank by</span>
    <div class="metric-buttons">
        <button
            type="button"
            class:active={$metric == RankingMetric.Epa}
            on:click={() => rankBy(RankingMetric.Epa)}
        >
            EPA
        </button>
        <button
            type="button"
            class:active={$metric == RankingMetric.Opr}
            on:click={() => rankBy(RankingMetric.Opr)}
        >
            OPR
        </button>
    </div>

    <a class="epa-link" href={`/epa/${season}`}>See EPA/OPR prediction accuracy &rarr;</a>
</div>

{#if rows}
    <StatTable
        data={statData}
        stats={statColumns}
        {focusedTeam}
        currentSort={{ id: currentSortId, dir: $sortDir }}
        rankStat={RANK_STATS[RankTy.NoFilter]}
        on:change_sort={(e) => changeSort(e.detail)}
    />

    <div class="pagination">
        <PageChooser bind:page={$pageNum} totalPageCount={pageCount} />
    </div>
{:else}
    <SkeletonRow card={false} rows={PAGE_SIZE} />
{/if}

<style>
    .metric-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--md-gap);
        margin-bottom: var(--md-gap);
    }

    .metric-label {
        font-size: var(--sm-font-size);
        font-weight: bold;
        color: var(--secondary-text-color);
    }

    .metric-buttons {
        display: flex;
        border: 1px solid var(--sep-color);
        border-radius: 6px;
        overflow: hidden;
    }

    .metric-buttons button {
        background: none;
        border: none;
        padding: 4px 12px;
        cursor: pointer;
        color: var(--text-color);
    }

    .metric-buttons button + button {
        border-left: 1px solid var(--sep-color);
    }

    .metric-buttons button.active {
        background: var(--theme-color);
        color: var(--theme-text-color);
        font-weight: bold;
    }

    .epa-link {
        margin-left: auto;
        color: var(--inline-theme-color);
        font-size: var(--sm-font-size);
        text-decoration: none;
    }

    .epa-link:hover {
        text-decoration: underline;
    }

    .pagination {
        display: flex;
        align-items: center;
        justify-content: center;
        margin-top: var(--lg-gap);
    }
</style>
