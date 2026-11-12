<script lang="ts">
    import {
        CategoryScale,
        Chart,
        LineController,
        LineElement,
        LinearScale,
        PointElement,
        Tooltip,
        type ChartDataset,
    } from "chart.js";
    import { faExpand, faMagnifyingGlassMinus } from "@fortawesome/free-solid-svg-icons";
    import Fa from "svelte-fa";
    import Modal from "$lib/components/Modal.svelte";
    import { formatMetricValue, metricLabel, type Metric } from "./stat-options";

    Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip);

    // chartjs-plugin-zoom pulls in hammerjs, which touches `window` at module load time - fine in
    // the browser, but it breaks SSR if imported at the top level. Load it lazily instead, from
    // the (client-only) chart action below.
    let zoomPluginPromise: Promise<void> | null = null;
    function ensureZoomPluginRegistered(): Promise<void> {
        if (!zoomPluginPromise) {
            zoomPluginPromise = import("chartjs-plugin-zoom").then((mod) => {
                Chart.register(mod.default);
            });
        }
        return zoomPluginPromise;
    }

    type PointRow = {
        date: string;
        matchesConsidered: number;
        accuracy?: number | null;
        brierScore?: number | null;
        logLoss?: number | null;
        scoreMae?: number | null;
        scoreRmse?: number | null;
    };

    export let series: { key: string; label: string; color: string; points: PointRow[] }[];
    export let metric: Metric;

    let expanded = false;
    let charts: Chart[] = [];

    function formatDate(iso: string): string {
        return new Date(iso).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    }

    // The site defines its theme variables on `body` (see static/css/global.css), not `:root` -
    // custom properties only cascade down to descendants, so reading them from `documentElement`
    // (an ancestor of body) would silently return "".
    function cssVar(name: string): string {
        return getComputedStyle(document.body).getPropertyValue(name).trim();
    }

    // Canvas drawing can't read CSS custom properties the way DOM elements can, so a `var(...)`
    // series color has to be resolved to an actual value before Chart.js touches it.
    function resolveColor(color: string): string {
        let m = color.match(/^var\((--[\w-]+)\)$/);
        return m ? cssVar(m[1]) : color;
    }

    $: allDates = [
        ...new Set(
            series.flatMap((s) => s.points.filter((p) => p[metric] != null).map((p) => p.date))
        ),
    ].sort();
    $: hasAnyData = allDates.length >= 2;

    $: datasets = series.map(
        (s): ChartDataset<"line"> => ({
            label: s.label,
            borderColor: resolveColor(s.color),
            backgroundColor: resolveColor(s.color),
            data: s.points
                .filter((p) => p[metric] != null)
                .map(
                    (p) =>
                        ({
                            x: p.date,
                            y: p[metric] as number,
                            matchesConsidered: p.matchesConsidered,
                        } as any)
                ),
            spanGaps: true,
            borderWidth: 2,
            pointRadius: 2.5,
            pointHoverRadius: 5,
            tension: 0,
        })
    );

    function themeColors() {
        return {
            axis: cssVar("--secondary-text-color"),
            grid: cssVar("--sep-color"),
            tooltipBg: cssVar("--fg-color"),
            tooltipText: cssVar("--text-color"),
        };
    }

    function buildConfig(): any {
        let colors = themeColors();
        return {
            type: "line",
            data: { labels: allDates, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: { mode: "nearest", axis: "x", intersect: false },
                scales: {
                    x: {
                        type: "category",
                        ticks: {
                            color: colors.axis,
                            autoSkip: true,
                            maxRotation: 0,
                            callback: function (this: any, val: any): string {
                                return formatDate(this.getLabelForValue(val));
                            },
                        },
                        grid: { display: false },
                    },
                    y: {
                        ticks: {
                            color: colors.axis,
                            callback: (val: any) => formatMetricValue(metric, val as number),
                        },
                        grid: { color: colors.grid },
                    },
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: colors.tooltipBg,
                        titleColor: colors.tooltipText,
                        bodyColor: colors.tooltipText,
                        borderColor: colors.grid,
                        borderWidth: 1,
                        callbacks: {
                            title: (items: any[]) => (items[0] ? formatDate(items[0].label) : ""),
                            label: (item: any) =>
                                ` ${item.dataset.label}: ${formatMetricValue(
                                    metric,
                                    item.parsed.y
                                )} (${item.raw.matchesConsidered} matches)`,
                        },
                    },
                    zoom: {
                        pan: { enabled: true, mode: "x" },
                        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" },
                        limits: { x: { min: allDates[0], max: allDates[allDates.length - 1] } },
                    },
                },
            },
        };
    }

    // A Svelte action lifecycle (mount/destroy) matches a canvas' lifecycle exactly, including the
    // modal's copy which only exists in the DOM while expanded - simpler than tracking it by hand.
    function chartAction(node: HTMLCanvasElement) {
        let chart: Chart | null = null;
        let destroyed = false;
        ensureZoomPluginRegistered().then(() => {
            if (destroyed) return;
            chart = new Chart(node, buildConfig());
            charts = [...charts, chart];
        });
        return {
            destroy() {
                destroyed = true;
                if (chart) {
                    charts = charts.filter((c) => c != chart);
                    chart.destroy();
                }
            },
        };
    }

    // Data/label/limit updates are applied in place rather than recreating the chart, so changing
    // the source/level/window filters doesn't reset the user's current pan/zoom position.
    $: if (charts.length) {
        for (let chart of charts) {
            chart.data.labels = allDates;
            chart.data.datasets = datasets;
            (chart.options.plugins as any).zoom.limits.x = {
                min: allDates[0],
                max: allDates[allDates.length - 1],
            };
            chart.update();
        }
    }

    function applyThemeColors() {
        if (!charts.length) return;
        let colors = themeColors();
        for (let chart of charts) {
            for (let [i, dataset] of chart.data.datasets.entries()) {
                dataset.borderColor = resolveColor(series[i].color);
                dataset.backgroundColor = resolveColor(series[i].color);
            }
            let scales = chart.options.scales as any;
            scales.x.ticks.color = colors.axis;
            scales.y.ticks.color = colors.axis;
            scales.y.grid.color = colors.grid;
            let tooltip = (chart.options.plugins as any).tooltip;
            tooltip.backgroundColor = colors.tooltipBg;
            tooltip.titleColor = colors.tooltipText;
            tooltip.bodyColor = colors.tooltipText;
            chart.update();
        }
    }

    function themeObserverAction(_node: HTMLElement) {
        let mq = window.matchMedia("(prefers-color-scheme: dark)");
        mq.addEventListener("change", applyThemeColors);

        let observer = new MutationObserver(applyThemeColors);
        observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });

        return {
            destroy() {
                mq.removeEventListener("change", applyThemeColors);
                observer.disconnect();
            },
        };
    }

    function resetZoom() {
        for (let chart of charts) (chart as any).resetZoom();
    }
</script>

{#if !hasAnyData}
    <p class="empty">
        Not enough scored matches yet for a {metricLabel(metric).toLowerCase()} graph.
    </p>
{:else}
    <div class="chart-card" use:themeObserverAction>
        <div class="toolbar">
            <button type="button" class="icon-btn" on:click={resetZoom} title="Reset zoom">
                <Fa icon={faMagnifyingGlassMinus} />
                Reset zoom
            </button>
            <button
                type="button"
                class="icon-btn"
                on:click={() => (expanded = true)}
                title="Full size"
            >
                <Fa icon={faExpand} />
                Full size
            </button>
        </div>
        <div class="chart-wrap">
            <canvas use:chartAction />
        </div>
        <p class="hint">Scroll or pinch to zoom, drag to pan.</p>
    </div>

    <Modal shown={expanded} titleText={metricLabel(metric)} close={() => (expanded = false)}>
        <div class="modal-toolbar">
            <button type="button" class="icon-btn" on:click={resetZoom} title="Reset zoom">
                <Fa icon={faMagnifyingGlassMinus} />
                Reset zoom
            </button>
        </div>
        <div class="chart-wrap expanded">
            {#if expanded}
                <canvas use:chartAction />
            {/if}
        </div>
    </Modal>
{/if}

<style>
    .empty {
        color: var(--secondary-text-color);
    }

    .toolbar,
    .modal-toolbar {
        display: flex;
        justify-content: flex-end;
        gap: var(--sm-gap);
        margin-bottom: var(--sm-gap);
    }

    .icon-btn {
        display: flex;
        align-items: center;
        gap: var(--sm-gap);
        background: none;
        border: 1px solid var(--sep-color);
        border-radius: 6px;
        padding: 4px 10px;
        font-size: var(--sm-font-size);
        color: var(--secondary-text-color);
        cursor: pointer;
    }

    .icon-btn:hover {
        color: var(--text-color);
        border-color: var(--secondary-text-color);
    }

    .chart-wrap {
        position: relative;
        height: 260px;
        width: 100%;
    }

    .chart-wrap.expanded {
        height: 65vh;
        width: min(1100px, 85vw);
    }

    .hint {
        margin-top: var(--sm-gap);
        color: var(--secondary-text-color);
        font-size: var(--sm-font-size);
    }
</style>
