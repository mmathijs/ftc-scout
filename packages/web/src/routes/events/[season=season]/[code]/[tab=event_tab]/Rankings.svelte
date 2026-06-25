<script lang="ts">
    import type { EventPageQuery } from "$lib/graphql/generated/graphql-operations";
    import { DESCRIPTORS, getTepStatSet, SortDir, type Season } from "@ftc-scout/common";
    import LocalStatTableControls from "$lib/components/stats/LocalStatTableControls.svelte";
    import LocalAllianceStatTableControls from "$lib/components/stats/LocalAllianceStatTableControls.svelte";

    type DataTy = NonNullable<EventPageQuery["eventByCode"]>["teams"][number];
    type AllianceTy = NonNullable<NonNullable<EventPageQuery["eventByCode"]>["alliances"]>[number];

    export let season: Season;
    export let remote: boolean;
    export let eventName: string;
    export let data: DataTy[];
    export let focusedTeam: number | null;
    export let hasRoundRobin: boolean = false;
    export let alliances: AllianceTy[] = [];

    $: descriptor = DESCRIPTORS[season];
    $: stats = getTepStatSet(season, remote);
    $: totalPoints = descriptor.pensSubtract || remote ? "totalPoints" : "totalPointsNp";
    $: defaultStats = hasRoundRobin
        ? ["eventRank", "team", "rankingScore", "tb1", "tb2", "played", "eventRecord"]
        : [
              "eventRank",
              "team",
              "rankingScore",
              "tb1",
              "played",
              totalPoints + "Avg",
              ...(remote ? [] : [totalPoints + "Opr"]),
              totalPoints + "Max",
          ];

    $: saveId = `eventPageTep${season}${remote ? "Remote" : "Trad"}`;
    $: underscoreEventName = eventName.replace(" ", "_");
    $: filename = `${season}_${underscoreEventName}_Team_Stats`;
    $: title = `${season} ${eventName} Team Stats`;
    $: csv = { filename, title };
</script>

{#if hasRoundRobin}
    <LocalAllianceStatTableControls
        {saveId}
        {data}
        {focusedTeam}
        {stats}
        {alliances}
        {defaultStats}
        defaultSort={{ id: "eventRank", dir: SortDir.Asc }}
        hideRankStats={[
            "eventRank",
            "rankingScore",
            ...(descriptor.rankings.rp == "Record"
                ? ["record"]
                : ["totalPointsAvg", "totalPointsTot"]),
        ]}
        {csv}
    />
{:else}
    <LocalStatTableControls
        {saveId}
        {data}
        {focusedTeam}
        {stats}
        {defaultStats}
        defaultSort={{ id: "eventRank", dir: SortDir.Asc }}
        hideRankStats={[
            "eventRank",
            "rankingScore",
            ...(descriptor.rankings.rp == "Record"
                ? ["record"]
                : ["totalPointsAvg", "totalPointsTot"]),
        ]}
        {csv}
    />
{/if}
