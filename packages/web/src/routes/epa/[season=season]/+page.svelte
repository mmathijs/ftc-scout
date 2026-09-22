<script lang="ts">
    import Card from "$lib/components/Card.svelte";
    import WidthProvider from "$lib/components/WidthProvider.svelte";
    import Head from "$lib/components/Head.svelte";
    import Form from "$lib/components/ui/form/Form.svelte";
    import SeasonSelect from "$lib/components/ui/form/SeasonSelect.svelte";
    import AccuracyChart from "./AccuracyChart.svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { DESCRIPTORS, type Season } from "@ftc-scout/common";
    import {
        EpaStatLevelFilter,
        EpaStatWindow,
        PredictionSourceFilter,
    } from "$lib/graphql/generated/graphql-operations";
    import { queryParam, queryParamUrlKeeping } from "$lib/util/search-params/search-params";
    import {
        ALL_SOURCES,
        formatMetricValue,
        METRIC_EC_DC,
        metricLabel,
        metricsAvailableFor,
        sourceColor,
        sourceLabel,
        STAT_DAYS_EC_DC,
        STAT_LEVEL_EC_DC,
        STAT_SOURCES_EC_DC,
        STAT_WINDOW_EC_DC,
    } from "./stat-options";
    import type { PageData } from "./$types";

    export let data: PageData;

    $: accuracyData = data.epaPredictionStatsData;
    $: seriesPoints = {
        [PredictionSourceFilter.Epa]: $accuracyData?.data.epa ?? [],
        [PredictionSourceFilter.EpaNp]: $accuracyData?.data.epaNp ?? [],
        [PredictionSourceFilter.Opr]: $accuracyData?.data.opr ?? [],
        [PredictionSourceFilter.WinLoss]: $accuracyData?.data.winLoss ?? [],
    };

    let statSources = queryParam("stat-source", STAT_SOURCES_EC_DC);
    let statLevel = queryParam("stat-level", STAT_LEVEL_EC_DC);
    let statWindow = queryParam("stat-window", STAT_WINDOW_EC_DC);
    let statDays = queryParam("stat-days", STAT_DAYS_EC_DC);
    let metric = queryParam("metric", METRIC_EC_DC);

    $: series = $statSources.map((source) => ({
        key: source,
        label: sourceLabel(source),
        color: sourceColor(source),
        points: seriesPoints[source],
    }));
    $: anyData = series.some((s) => s.points.length > 0);

    function toggleSource(source: PredictionSourceFilter, checked: boolean) {
        $statSources = checked
            ? [...$statSources, source]
            : $statSources.filter((s) => s != source);
    }

    // WinLoss has no score model, so scoreMae/scoreRmse aren't offered while it's shown - fall
    // back to accuracy if the current metric stops being available after a selection change.
    $: availableMetrics = metricsAvailableFor($statSources);
    $: if (!availableMetrics.includes($metric)) $metric = "accuracy";

    $: season = +$page.params.season as Season;
    let selectedSeason: Season;
    $: selectedSeason = season;
    $: if (selectedSeason != season) {
        goto(`/epa/${selectedSeason}${queryParamUrlKeeping([])}`);
    }
</script>

<Head
    title={`${season} EPA Prediction Accuracy | FTCScout`}
    description={`How well EPA, OPR, and win/loss predictions have performed for the ${DESCRIPTORS[season].seasonName} season.`}
/>

<WidthProvider width="850px">
    <Card>
        <h1>{DESCRIPTORS[season].seasonName} EPA Prediction Accuracy</h1>
        <p class="blurb">
            EPA is a rating that updates after every qualification match, estimating how many points
            a team contributes to their alliance beyond an average team. This page tracks how well
            it - and a couple of other team-strength models - actually predict who wins. Looking for
            team rankings? See the
            <a href={`/records/${season}/teams`}>Season Records teams tab</a>.
        </p>

        <Form id="epa-options" noscriptSubmit>
            <label for="season-select">
                Season
                <SeasonSelect bind:season={selectedSeason} id="season-select" />
            </label>
        </Form>
    </Card>
</WidthProvider>

{#if accuracyData}
    <WidthProvider width="850px">
        <Card>
            <h2>Prediction Stats</h2>
            <p class="blurb">
                How well pre-match win predictions have actually done this season, compared across a
                few team-strength models. Every prediction actually made counts, including each
                model's own early-season ramp-up - so it naturally scores lower before there's
                enough data to work with. Ties are excluded (there's no winner to call correctly).
            </p>

            <Form id="prediction-stat-options" style="col" noscriptSubmit>
                <div class="predictor-group">
                    <span class="predictor-label">Predictors</span>
                    <div class="checkboxes">
                        {#each ALL_SOURCES as source}
                            <label class="checkbox">
                                <input
                                    type="checkbox"
                                    checked={$statSources.includes(source)}
                                    on:change={(e) => toggleSource(source, e.currentTarget.checked)}
                                />
                                <span class="swatch" style:background={sourceColor(source)} />
                                {sourceLabel(source)}
                            </label>
                        {/each}
                    </div>
                </div>

                <div class="row">
                    <label for="level-select">
                        Matches
                        <select id="level-select" bind:value={$statLevel}>
                            <option value={EpaStatLevelFilter.All}>All</option>
                            <option value={EpaStatLevelFilter.Quals}>Qualification only</option>
                            <option value={EpaStatLevelFilter.Playoff}>Playoffs only</option>
                        </select>
                    </label>

                    <label for="window-select">
                        Window
                        <select id="window-select" bind:value={$statWindow}>
                            <option value={EpaStatWindow.Cumulative}>Cumulative</option>
                            <option value={EpaStatWindow.Daily}>Daily</option>
                            <option value={EpaStatWindow.Trailing}>Trailing window</option>
                        </select>
                    </label>

                    {#if $statWindow == EpaStatWindow.Trailing}
                        <label for="days-select">
                            Trailing days
                            <select id="days-select" bind:value={$statDays}>
                                <option value={7}>Last 7 days</option>
                                <option value={14}>Last 14 days</option>
                                <option value={30}>Last 30 days</option>
                            </select>
                        </label>
                    {/if}

                    <label for="metric-select">
                        Metric
                        <select id="metric-select" bind:value={$metric}>
                            {#each availableMetrics as m}
                                <option value={m}>{metricLabel(m)}</option>
                            {/each}
                        </select>
                    </label>
                </div>
            </Form>

            {#if series.length == 0}
                <p class="empty">Check at least one predictor above to see its stats.</p>
            {:else if anyData}
                <div class="stats">
                    {#each series as s}
                        {@const last = s.points.length ? s.points[s.points.length - 1] : null}
                        <div class="stat">
                            <span class="stat-label">
                                <span class="swatch" style:background={s.color} />
                                {s.label} - {metricLabel($metric)}
                            </span>
                            <span class="stat-value">
                                {last ? formatMetricValue($metric, last[$metric]) : "N/A"}
                            </span>
                            {#if last}
                                <span class="stat-sub">{last.matchesConsidered} matches</span>
                            {/if}
                        </div>
                    {/each}
                </div>

                <AccuracyChart {series} metric={$metric} />
                <p class="note">
                    Early points are based on far fewer matches and can swing a lot from just one or
                    two results - they settle down as the season goes on.
                </p>
            {:else}
                <p class="empty">
                    No scored predictions yet for this filter - EPA needs about 45 days of matches
                    before it has enough data to start making real predictions.
                </p>
            {/if}
        </Card>
    </WidthProvider>
{/if}

<style>
    h1 {
        margin-top: var(--sm-gap);
        margin-bottom: var(--md-gap);
    }

    h2 {
        font-size: var(--lg-font-size);
        margin-bottom: var(--md-gap);
    }

    .blurb {
        color: var(--secondary-text-color);
        margin-bottom: var(--md-gap);
    }

    .blurb a {
        color: var(--inline-theme-color);
    }

    .empty {
        color: var(--secondary-text-color);
    }

    label {
        display: flex;
        flex-direction: column;
        gap: var(--sm-gap);
        max-width: 20ch;
    }

    .row {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        gap: var(--md-gap);
        margin-bottom: var(--md-gap);
    }

    .predictor-group {
        display: flex;
        flex-direction: column;
        gap: var(--sm-gap);
        margin-bottom: var(--md-gap);
    }

    .predictor-label {
        font-size: var(--sm-font-size);
        font-weight: bold;
        color: var(--secondary-text-color);
    }

    .checkboxes {
        display: flex;
        flex-wrap: wrap;
        gap: var(--md-gap);
    }

    label.checkbox {
        flex-direction: row;
        align-items: center;
        gap: var(--sm-gap);
        max-width: none;
        cursor: pointer;
    }

    .swatch {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    @media (max-width: 800px) {
        .row {
            flex-direction: column;
            gap: var(--md-gap);
        }
    }

    .note {
        margin-top: var(--sm-gap);
        color: var(--secondary-text-color);
        font-size: var(--sm-font-size);
    }

    .stats {
        display: flex;
        flex-wrap: wrap;
        gap: var(--lg-gap);
        margin-bottom: var(--md-gap);
    }

    .stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .stat-label {
        display: flex;
        align-items: center;
        gap: var(--sm-gap);
        font-size: var(--sm-font-size);
        font-weight: bold;
        color: var(--secondary-text-color);
    }

    .stat-value {
        font-size: var(--lg-font-size);
    }

    .stat-sub {
        font-size: var(--sm-font-size);
        color: var(--secondary-text-color);
    }
</style>
