<script lang="ts" context="module">
    import {
        Color,
        NonRankStatColumn,
        StatSet,
        StatSetSection,
        StatType,
        type StatValue,
    } from "@ftc-scout/common";
    import type { Sos } from "$lib/sos";

    const SOS_STATS: [keyof Sos, string, string, string, StatType][] = [
        [
            "composite",
            "SOS",
            "Strength of Schedule",
            "Strength of Schedule (share of random schedules that are easier)",
            StatType.Float,
        ],
        [
            "deltaEpa",
            "Sched Δ EPA",
            "Schedule Δ EPA",
            "Schedule Δ EPA (partners' EPA less opponents', for an average team)",
            StatType.Float,
        ],
        [
            "epaPercentile",
            "Δ EPA Pctl",
            "Δ EPA Percentile",
            "Δ EPA Percentile (share of random schedules with a better Δ EPA)",
            StatType.Float,
        ],
        ["expectedWins", "Exp Wins", "Expected Wins", "Expected Wins", StatType.Float],
        [
            "deltaWins",
            "Sched Δ Wins",
            "Schedule Δ Wins",
            "Schedule Δ Wins (expected wins compared with random schedules)",
            StatType.Float,
        ],
        [
            "winsPercentile",
            "Wins Pctl",
            "Wins Percentile",
            "Wins Percentile (share of random schedules with more expected wins)",
            StatType.Float,
        ],
        ["expectedRank", "Exp Rank", "Expected Rank", "Expected Rank", StatType.Float],
        [
            "deltaRank",
            "Sched Δ Rank",
            "Schedule Δ Rank",
            "Schedule Δ Rank (expected rank compared with random schedules, positive is worse)",
            StatType.Float,
        ],
        [
            "rankPercentile",
            "Rank Pctl",
            "Rank Percentile",
            "Rank Percentile (share of random schedules with a better expected rank)",
            StatType.Float,
        ],
    ];

    const SOS_COLUMNS = SOS_STATS.map(
        ([key, columnName, dialogName, titleName, ty]) =>
            new NonRankStatColumn<any>({
                id: "sos" + (key == "composite" ? "" : key[0].toUpperCase() + key.slice(1)),
                columnName,
                dialogName,
                titleName,
                sqlExpr: "",
                color: Color.LightBlue,
                ty,
                getNonRankValue: (d): StatValue | null =>
                    d.sos ? { ty: "float", val: d.sos[key] } : null,
            })
    );

    const SOS_SECTION = new StatSetSection(
        "Strength of Schedule",
        SOS_COLUMNS.map((c) => ({ val: { id: c.id, name: c.dialogName }, children: [] })),
        [
            {
                id: "",
                name: "",
                color: Color.LightBlue,
                description:
                    "How hard each team's qualification schedule is, compared with random ones. " +
                    "Percentiles are the share of random schedules that are easier: 0.5 is average, " +
                    "higher is harder.",
            },
        ]
    );

    let withSosCache = new Map<string, StatSet<any>>();

    function withSos(stats: StatSet<any>): StatSet<any> {
        let id = stats.id + "Sos";
        if (!withSosCache.has(id)) {
            withSosCache.set(
                id,
                new StatSet(
                    id,
                    [...stats.allStats, ...SOS_COLUMNS],
                    [...stats.sections, SOS_SECTION]
                )
            );
        }
        return withSosCache.get(id)!;
    }
</script>

<script lang="ts">
    import type {
        EventPageQuery,
        FullMatchFragment,
    } from "$lib/graphql/generated/graphql-operations";
    import { DESCRIPTORS, getTepStatSet, SortDir, type Season } from "@ftc-scout/common";
    import LocalStatTableControls from "$lib/components/stats/LocalStatTableControls.svelte";
    import { scheduleStrength } from "$lib/sos";
    import { eventEpa } from "$lib/util/event-epa";

    type EventTeam = NonNullable<EventPageQuery["eventByCode"]>["teams"][number];
    type LeagueRankingEntry = NonNullable<
        EventPageQuery["eventByCode"]
    >["leagueRankings"][number]["teams"][number];
    type DataTy = EventTeam | LeagueRankingEntry;

    export let season: Season;
    export let remote: boolean;
    export let eventName: string;
    export let data: DataTy[];
    export let focusedTeam: number | null;
    export let saveIdOverride: string | null = null;
    export let leagueMode: boolean = false;
    /** The event's matches, for the strength of schedule. */
    export let matches: FullMatchFragment[] = [];
    export let eventCode: string = "";

    $: descriptor = DESCRIPTORS[season];

    $: sos =
        leagueMode || remote
            ? new Map<number, Sos>()
            : scheduleStrength(
                  matches,
                  new Map(data.map((t) => [t.teamNumber, eventEpa(t)])),
                  `${season} ${eventCode}`
              );
    $: rows = sos.size ? data.map((t) => ({ ...t, sos: sos.get(t.teamNumber) ?? null })) : data;
    $: baseStats = getTepStatSet(season, remote, leagueMode);
    $: stats = sos.size ? withSos(baseStats) : baseStats;
    $: totalPoints = descriptor.pensSubtract || remote ? "totalPoints" : "totalPointsNp";
    $: defaultStats = [
        "eventRank",
        "team",
        "rankingScore",
        "tb1",
        ...(leagueMode ? ["avgRp"] : []),
        "played",
        ...(remote ? [] : ["eventRecord"]),
        totalPoints + "Avg",
        ...(remote ? [] : [totalPoints + "Opr"]),
        "totalPointsEpa",
        totalPoints + "Max",
        ...(sos.size ? ["sos"] : []),
    ];

    $: defaultSaveId = `eventPageTep${season}${remote ? "Remote" : "Trad"}${
        leagueMode ? "League" : ""
    }`;
    $: saveId = saveIdOverride ?? defaultSaveId;

    $: underscoreEventName = eventName.replace(" ", "_");
    $: filename = `${season}_${underscoreEventName}_Team_Stats`;
    $: title = `${season} ${eventName} Team Stats`;
    $: csv = { filename, title };
</script>

<LocalStatTableControls
    {saveId}
    data={rows}
    {focusedTeam}
    {stats}
    {defaultStats}
    defaultSort={{ id: "eventRank", dir: SortDir.Asc }}
    hideRankStats={[
        "eventRank",
        "rankingScore",
        ...(descriptor.rankings.rp == "Record" ? ["record"] : ["totalPointsAvg", "totalPointsTot"]),
    ]}
    {csv}
/>

{#if sos.size}
    <p class="sos-note">
        <b>SOS</b> (strength of schedule) compares each team's qualification schedule with 500
        random ones. For more info look at
        <a href="https://www.statbotics.io/blog/sos" target="_blank" rel="noreferrer">Statbotics</a>
        blog post. To view the 3 underlying columns it averages click <i>Statistics</i>.
    </p>
{/if}

<style>
    .sos-note {
        margin-top: var(--lg-gap);
        color: var(--secondary-text-color);
        font-size: var(--sm-font-size);
    }
</style>
