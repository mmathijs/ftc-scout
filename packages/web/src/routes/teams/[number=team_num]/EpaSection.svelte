<script lang="ts">
    import Card from "../../../lib/components/Card.svelte";
    import type { TeamQuery } from "../../../lib/graphql/generated/graphql-operations";
    import { prettyPrintFloat, prettyPrintOrdinal } from "../../../lib/printers/number";

    export let epa: NonNullable<NonNullable<TeamQuery["teamByNumber"]>["epa"]>;
    export let history: NonNullable<NonNullable<TeamQuery["teamByNumber"]>["epaHistory"]>;
    export let epaGroup: NonNullable<TeamQuery["teamByNumber"]>["epaGroup"] = null;
    export let epaGroupHistory: NonNullable<TeamQuery["teamByNumber"]>["epaGroupHistory"] = null;

    type LineKey = "total" | "auto" | "dc" | "np";
    const LINE_LABELS: Record<LineKey, string> = {
        total: "Total",
        auto: "Auto",
        dc: "Teleop",
        np: "No Penalties",
    };
    const LINE_COLORS: Record<LineKey, string> = {
        total: "var(--red-stat-color)",
        auto: "var(--green-stat-color)",
        dc: "var(--light-blue-stat-color)",
        np: "var(--purple-stat-color)",
    };
    const LINE_ORDER: LineKey[] = ["total", "np", "auto", "dc"];

    // Epa history plot
    type CategoryStat = { epa: number; matchesPlayed: number; rank: number };
    type Point = { matchNum: number; epa: number; eventCode: string; matchTime: string | null };

    $: lineStats = {
        total: epa as CategoryStat,
        auto: (epaGroup?.auto ?? null) as CategoryStat | null,
        dc: (epaGroup?.dc ?? null) as CategoryStat | null,
        eg: (epaGroup?.eg ?? null) as CategoryStat | null,
        np: (epaGroup?.np ?? null) as CategoryStat | null,
    };
    $: lineHistories = {
        total: history,
        auto: epaGroupHistory?.auto ?? null,
        dc: epaGroupHistory?.dc ?? null,
        eg: epaGroupHistory?.eg ?? null,
        np: epaGroupHistory?.np ?? null,
    };
    $: activeLines = LINE_ORDER.filter((k) => lineStats[k] != null);

    let hidden = new Set<LineKey>();
    function toggleLine(k: LineKey) {
        let next = new Set(hidden);
        if (next.has(k)) {
            next.delete(k);
        } else {
            if (activeLines.filter((l) => !next.has(l)).length <= 1) return;
            next.add(k);
        }
        hidden = next;
        hovered = null;
    }
    $: visibleLines = activeLines.filter((k) => !hidden.has(k));

    $: linePoints = Object.fromEntries(
        activeLines.map((k): [LineKey, Point[]] => [
            k,
            (lineHistories[k] ?? []).map((h) => ({
                matchNum: h.matchesPlayed,
                epa: h.epa,
                eventCode: h.eventCode,
                matchTime: h.matchTime,
            })),
        ])
    ) as Partial<Record<LineKey, Point[]>>;

    $: referencePoints = linePoints.total ?? [];
    $: pointCount = referencePoints.length;

    const WIDTH = 900;
    const HEIGHT = 280;
    const PAD_LEFT = 50;
    const PAD_RIGHT = 16;
    const PAD_TOP = 16;
    const PAD_BOTTOM = 34;

    $: allEpaValues = visibleLines.flatMap((k) => (linePoints[k] ?? []).map((p) => p.epa));
    $: minEpa = allEpaValues.length ? Math.min(...allEpaValues) : 0;
    $: maxEpa = allEpaValues.length ? Math.max(...allEpaValues) : 1;
    $: range = maxEpa - minEpa || 1;
    $: yPad = range * 0.1;
    // EPA's axis floor never goes below 0, even if padding would otherwise push it there.
    $: axisLo = Math.max(0, minEpa - yPad);
    $: axisHi = maxEpa + yPad;

    function xFor(i: number) {
        if (pointCount <= 1) return PAD_LEFT;
        return PAD_LEFT + (i / (pointCount - 1)) * (WIDTH - PAD_LEFT - PAD_RIGHT);
    }
    function yFor(epa: number) {
        let frac = (epa - axisLo) / (axisHi - axisLo || 1);
        return HEIGHT - PAD_BOTTOM - frac * (HEIGHT - PAD_TOP - PAD_BOTTOM);
    }

    // For hover
    function bandStart(i: number) {
        if (pointCount <= 1) return PAD_LEFT;
        return i == 0 ? PAD_LEFT : (xFor(i - 1) + xFor(i)) / 2;
    }
    function bandWidth(i: number) {
        if (pointCount <= 1) return WIDTH - PAD_LEFT - PAD_RIGHT;
        let right = i == pointCount - 1 ? WIDTH - PAD_RIGHT : (xFor(i) + xFor(i + 1)) / 2;
        return right - bandStart(i);
    }

    $: paths = Object.fromEntries(
        visibleLines.map((k): [LineKey, string] => [
            k,
            (linePoints[k] ?? [])
                .map((p, i) => `${i == 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.epa)}`)
                .join(" "),
        ])
    ) as Partial<Record<LineKey, string>>;

    $: yTicks = 4;
    $: yTickValues = Array.from(
        { length: yTicks + 1 },
        (_, i) => axisLo + ((axisHi - axisLo) * i) / yTicks
    );

    $: xTickCount = Math.min(pointCount, 8);
    $: xTickIndices = Array.from({ length: xTickCount }, (_, i) =>
        Math.round((i / Math.max(1, xTickCount - 1)) * (pointCount - 1))
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

    const BUBBLE_W = 200;
    $: lastValueY = 36 + (visibleLines.length - 1) * 15;
    $: dateY = lastValueY + 16;
    $: bubbleH = dateY + 10;
    $: bubbleX =
        hovered == null
            ? 0
            : Math.min(Math.max(xFor(hovered) - BUBBLE_W / 2, 2), WIDTH - BUBBLE_W - 2);
    $: bubbleY =
        hovered == null
            ? 0
            : Math.max(
                  Math.min(
                      ...visibleLines.map((k) => yFor(linePoints[k]?.[hovered!]?.epa ?? maxEpa))
                  ) -
                      bubbleH -
                      14,
                  2
              );
</script>

<Card>
    <h2 id="epa">EPA</h2>
    <hr />

    <div class="stats">
        {#each activeLines as k}
            {@const stat = lineStats[k]}
            {#if stat}
                <button
                    type="button"
                    class="stat-card"
                    class:hidden={hidden.has(k)}
                    style:--line-color={LINE_COLORS[k]}
                    aria-pressed={!hidden.has(k)}
                    title="Toggle {LINE_LABELS[k]} on the graph"
                    on:click={() => toggleLine(k)}
                >
                    <div class="stat-card-label">
                        <span class="legend-dot" style:background={LINE_COLORS[k]} />
                        {LINE_LABELS[k]}
                    </div>
                    <div class="stat-card-body">
                        <div class="stat">
                            <span class="stat-label">Rating</span>
                            <span class="stat-value">{prettyPrintFloat(stat.epa)}</span>
                        </div>
                        <div class="stat">
                            <span class="stat-label">World Rank</span>
                            <span class="stat-value">{prettyPrintOrdinal(stat.rank)}</span>
                        </div>
                    </div>
                </button>
            {/if}
        {/each}
    </div>
    <p class="matches">
        Based on {epa.matchesPlayed} matches. Total isn't simply Auto + Teleop
    </p>

    {#if pointCount < 2}
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
                    #{referencePoints[i].matchNum}
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

            {#each visibleLines as k}
                <path d={paths[k]} class="line" style:stroke={LINE_COLORS[k]} fill="none" />
            {/each}

            {#each visibleLines as k}
                {#each linePoints[k] ?? [] as p, i}
                    <circle
                        cx={xFor(i)}
                        cy={yFor(p.epa)}
                        r={hovered == i ? 5 : 3}
                        class="point"
                        style:fill={LINE_COLORS[k]}
                    />
                {/each}
            {/each}

            {#each referencePoints as p, i}
                <rect
                    x={bandStart(i)}
                    y={PAD_TOP}
                    width={bandWidth(i)}
                    height={HEIGHT - PAD_TOP - PAD_BOTTOM}
                    fill="transparent"
                    tabindex="0"
                    role="button"
                    aria-label={`Match ${p.matchNum}`}
                    on:mouseenter={() => (hovered = i)}
                    on:mouseleave={() => (hovered = null)}
                    on:focus={() => (hovered = i)}
                    on:blur={() => (hovered = null)}
                />
            {/each}

            {#if hovered != null}
                {@const ref = referencePoints[hovered]}
                <g class="bubble" transform="translate({bubbleX}, {bubbleY})" pointer-events="none">
                    <rect width={BUBBLE_W} height={bubbleH} rx="6" class="bubble-bg" />
                    <text x="10" y="18" class="bubble-line bubble-title">
                        {ref.eventCode} - Match {ref.matchNum}
                    </text>
                    {#each visibleLines as k, li}
                        {@const y = 36 + li * 15}
                        <rect
                            x="10"
                            y={y - 9}
                            width="8"
                            height="8"
                            rx="2"
                            style:fill={LINE_COLORS[k]}
                        />
                        <text x="22" {y} class="bubble-line bubble-value">
                            {LINE_LABELS[k]}: {(linePoints[k]?.[hovered]?.epa ?? 0).toFixed(2)}
                        </text>
                    {/each}
                    <text x="10" y={dateY} class="bubble-line bubble-sub">
                        {formatDate(ref.matchTime)}
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
        flex-wrap: wrap;
        gap: var(--md-gap);
    }

    .stat-card {
        display: flex;
        flex-direction: column;
        gap: var(--sm-gap);

        font: inherit;
        color: inherit;
        text-align: left;

        background: var(--fg-color);
        border: 1px solid var(--sep-color);
        border-top: 3px solid var(--line-color);
        border-radius: 8px;
        padding: var(--sm-pad) var(--md-pad);

        cursor: pointer;
        transition: opacity 0.15s ease;
    }

    .stat-card:hover {
        background: var(--tab-hover-color);
    }

    .stat-card.hidden {
        opacity: 0.45;
    }

    .stat-card-label {
        display: flex;
        align-items: center;
        gap: var(--sm-gap);
        font-size: var(--sm-font-size);
        font-weight: bold;
        color: var(--secondary-text-color);
    }

    .legend-dot {
        display: inline-block;
        width: 9px;
        height: 9px;
        border-radius: 50%;
    }

    .stat-card-body {
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
        stroke-width: 2;
    }

    .point {
        pointer-events: none;
        transition: r 0.1s ease;
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
