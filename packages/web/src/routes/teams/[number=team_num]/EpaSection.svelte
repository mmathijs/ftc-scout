<script lang="ts">
    import Card from "../../../lib/components/Card.svelte";
    import type { TeamQuery } from "../../../lib/graphql/generated/graphql-operations";
    import { prettyPrintFloat, prettyPrintOrdinal } from "../../../lib/printers/number";

    export let epa: NonNullable<NonNullable<TeamQuery["teamByNumber"]>["epa"]>;
    export let history: NonNullable<NonNullable<TeamQuery["teamByNumber"]>["epaHistory"]>;

    // Epa history plot
    $: points = history.map((h) => ({
        matchNum: h.matchesPlayed,
        epa: h.epa,
        eventCode: h.eventCode,
        matchTime: h.matchTime,
    }));

    const WIDTH = 900;
    const HEIGHT = 280;
    const PAD_LEFT = 50;
    const PAD_RIGHT = 16;
    const PAD_TOP = 16;
    const PAD_BOTTOM = 34;

    $: minEpa = points.length ? Math.min(...points.map((p) => p.epa)) : 0;
    $: maxEpa = points.length ? Math.max(...points.map((p) => p.epa)) : 1;
    $: range = maxEpa - minEpa || 1;
    $: yPad = range * 0.1;

    function xFor(i: number) {
        if (points.length <= 1) return PAD_LEFT;
        return PAD_LEFT + (i / (points.length - 1)) * (WIDTH - PAD_LEFT - PAD_RIGHT);
    }
    function yFor(epa: number) {
        let lo = minEpa - yPad;
        let hi = maxEpa + yPad;
        let frac = (epa - lo) / (hi - lo || 1);
        return HEIGHT - PAD_BOTTOM - frac * (HEIGHT - PAD_TOP - PAD_BOTTOM);
    }

    $: path = points.map((p, i) => `${i == 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.epa)}`).join(" ");

    $: yTicks = 4;
    $: yTickValues = Array.from(
        { length: yTicks + 1 },
        (_, i) => minEpa - yPad + ((maxEpa + yPad - (minEpa - yPad)) * i) / yTicks
    );

    $: xTickCount = Math.min(points.length, 8);
    $: xTickIndices = Array.from({ length: xTickCount }, (_, i) =>
        Math.round((i / Math.max(1, xTickCount - 1)) * (points.length - 1))
    ).filter((v, i, arr) => arr.indexOf(v) == i);

    function formatDate(iso: string | null): string {
        if (!iso) return "";
        return new Date(iso).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    }

    let hovered: number | null = null;

    const BUBBLE_W = 190;
    const BUBBLE_H = 62;
    $: bubbleX =
        hovered == null
            ? 0
            : Math.min(Math.max(xFor(hovered) - BUBBLE_W / 2, 2), WIDTH - BUBBLE_W - 2);
    $: bubbleY = hovered == null ? 0 : Math.max(yFor(points[hovered].epa) - BUBBLE_H - 14, 2);
</script>

<Card>
    <h2 id="epa">EPA</h2>
    <hr />

    <div class="stats">
        <div class="stat">
            <span class="stat-label">Rating</span>
            <span class="stat-value">{prettyPrintFloat(epa.epa)}</span>
        </div>
        <div class="stat">
            <span class="stat-label">World Rank</span>
            <span class="stat-value">{prettyPrintOrdinal(epa.rank)}</span>
        </div>
    </div>
    <p class="matches">
        Based on {epa.matchesPlayed} matches.
    </p>

    {#if points.length < 2}
        <p class="empty">Insufficient matches played thus far for an EPA graph.</p>
    {:else}
        <svg viewBox="0 0 {WIDTH} {HEIGHT}" class="chart" role="img" aria-label="EPA over time">
            {#each yTickValues as tick}
                <line
                    x1={PAD_LEFT}
                    x2={WIDTH - PAD_RIGHT}
                    y1={yFor(tick)}
                    y2={yFor(tick)}
                    class="gridline"
                />
                <text
                    x={PAD_LEFT - 8}
                    y={yFor(tick)}
                    class="axis-label"
                    text-anchor="end"
                    dominant-baseline="middle"
                >
                    {prettyPrintFloat(tick)}
                </text>
            {/each}

            {#each xTickIndices as i}
                <text x={xFor(i)} y={HEIGHT - 8} class="axis-label" text-anchor="middle">
                    #{points[i].matchNum}
                </text>
            {/each}
            <text
                x={(PAD_LEFT + WIDTH - PAD_RIGHT) / 2}
                y={HEIGHT - 20}
                class="axis-title"
                text-anchor="middle"
            >
                Match number
            </text>

            <path d={path} class="line" fill="none" />

            {#each points as p, i}
                <circle
                    cx={xFor(i)}
                    cy={yFor(p.epa)}
                    r={hovered == i ? 5 : 3}
                    class="point"
                    tabindex="0"
                    role="button"
                    aria-label={`Match ${p.matchNum}: ${prettyPrintFloat(p.epa)} EPA`}
                    on:mouseenter={() => (hovered = i)}
                    on:mouseleave={() => (hovered = null)}
                    on:focus={() => (hovered = i)}
                    on:blur={() => (hovered = null)}
                />
            {/each}

            {#if hovered != null}
                {@const p = points[hovered]}
                <g class="bubble" transform="translate({bubbleX}, {bubbleY})" pointer-events="none">
                    <rect width={BUBBLE_W} height={BUBBLE_H} rx="6" class="bubble-bg" />
                    <text x="10" y="18" class="bubble-line bubble-title">
                        {p.eventCode} - Match {p.matchNum}
                    </text>
                    <text x="10" y="36" class="bubble-line bubble-value">
                        EPA: {p.epa.toFixed(2)}
                    </text>
                    <text x="10" y="52" class="bubble-line bubble-sub">
                        {formatDate(p.matchTime)}
                    </text>
                </g>
            {/if}
        </svg>
    {/if}
</Card>

<style>
    h2 {
        font-size: var(--lg-font-size);
        margin-bottom: var(--md-gap);
    }

    hr {
        margin-bottom: var(--md-gap);
    }

    .stats {
        display: flex;
        gap: var(--lg-gap);
    }

    .stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .stat-label {
        font-size: var(--sm-font-size);
        font-weight: bold;
        color: var(--secondary-text-color);
    }

    .stat-value {
        font-size: var(--lg-font-size);
    }

    .matches {
        margin-top: var(--md-gap);
        margin-bottom: var(--md-gap);
        color: var(--secondary-text-color);
        font-size: var(--sm-font-size);
    }

    .empty {
        color: var(--secondary-text-color);
    }

    .chart {
        width: 100%;
        height: auto;
        overflow: visible;
    }

    .gridline {
        stroke: var(--sep-color);
        stroke-width: 1;
    }

    .axis-label {
        fill: var(--secondary-text-color);
        font-size: 11px;
    }

    .axis-title {
        fill: var(--secondary-text-color);
        font-size: 11px;
        font-weight: bold;
    }

    .line {
        stroke: var(--inline-theme-color);
        stroke-width: 2;
    }

    .point {
        fill: var(--inline-theme-color);
        cursor: pointer;
        transition: r 0.1s ease;
    }

    .point:hover,
    .point:focus {
        fill: var(--theme-color);
        outline: none;
    }

    .bubble-bg {
        fill: var(--fg-color);
        stroke: var(--sep-color);
        stroke-width: 1;
    }

    .bubble-line {
        font-size: 12px;
        fill: var(--text-color);
    }

    .bubble-title {
        font-weight: bold;
    }

    .bubble-value {
        fill: var(--inline-theme-color);
        font-weight: bold;
    }

    .bubble-sub {
        fill: var(--secondary-text-color);
        font-size: 11px;
    }
</style>
