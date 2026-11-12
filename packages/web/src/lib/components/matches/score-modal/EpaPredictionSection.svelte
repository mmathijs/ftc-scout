<script lang="ts">
    export let epaPrediction: {
        redScore: number;
        blueScore: number;
        redWinProb: number;
        redSigma: number;
        blueSigma: number;
    };

    export let actualRed: number | undefined = undefined;
    export let actualBlue: number | undefined = undefined;
    $: hasActual = actualRed != undefined && actualBlue != undefined;

    $: pred = epaPrediction;
    $: redSd = Math.max(pred.redSigma, 1);
    $: blueSd = Math.max(pred.blueSigma, 1);

    $: favoredIsRed = pred.redWinProb >= 0.5;
    $: favoredProb = favoredIsRed ? pred.redWinProb : 1 - pred.redWinProb;

    const WIDTH = 900;
    const HEIGHT = 240;
    const PAD_LEFT = 16;
    const PAD_RIGHT = 16;
    const PAD_TOP = 40;
    const PAD_BOTTOM = 46;

    function normalPdf(x: number, mean: number, sd: number): number {
        return Math.exp(-((x - mean) ** 2) / (2 * sd * sd)) / (sd * Math.sqrt(2 * Math.PI));
    }

    // Show 2 SD in the graph
    $: xMin = Math.min(
        pred.redScore - 2 * redSd,
        pred.blueScore - 2 * blueSd,
        ...(hasActual ? [actualRed!, actualBlue!] : [])
    );
    $: xMax = Math.max(
        pred.redScore + 2 * redSd,
        pred.blueScore + 2 * blueSd,
        ...(hasActual ? [actualRed!, actualBlue!] : [])
    );
    $: xRange = xMax - xMin || 1;

    function xFor(score: number) {
        return PAD_LEFT + ((score - xMin) / xRange) * (WIDTH - PAD_LEFT - PAD_RIGHT);
    }

    const SAMPLES = 100;
    $: peakDensity = Math.max(normalPdf(0, 0, redSd), normalPdf(0, 0, blueSd));

    function yFor(density: number) {
        let frac = density / (peakDensity || 1);
        return HEIGHT - PAD_BOTTOM - frac * (HEIGHT - PAD_TOP - PAD_BOTTOM);
    }

    function curvePath(mean: number, sd: number): string {
        let points: string[] = [];
        for (let i = 0; i <= SAMPLES; i++) {
            let x = xMin + (i / SAMPLES) * xRange;
            let y = yFor(normalPdf(x, mean, sd));
            points.push(`${i == 0 ? "M" : "L"} ${xFor(x)} ${y}`);
        }
        return points.join(" ");
    }

    function fillPath(mean: number, sd: number): string {
        return `${curvePath(mean, sd)} L ${xFor(xMax)} ${HEIGHT - PAD_BOTTOM} L ${xFor(xMin)} ${
            HEIGHT - PAD_BOTTOM
        } Z`;
    }

    // Make striped for overlap
    function overlapPath(meanA: number, sdA: number, meanB: number, sdB: number): string {
        let points: string[] = [];
        for (let i = 0; i <= SAMPLES; i++) {
            let x = xMin + (i / SAMPLES) * xRange;
            let density = Math.min(normalPdf(x, meanA, sdA), normalPdf(x, meanB, sdB));
            let y = yFor(density);
            points.push(`${i == 0 ? "M" : "L"} ${xFor(x)} ${y}`);
        }
        points.push(
            `L ${xFor(xMax)} ${HEIGHT - PAD_BOTTOM}`,
            `L ${xFor(xMin)} ${HEIGHT - PAD_BOTTOM}`,
            "Z"
        );
        return points.join(" ");
    }

    $: peakX_red = xFor(pred.redScore);
    $: peakX_blue = xFor(pred.blueScore);

    $: peakY_red = yFor(normalPdf(0, 0, redSd));
    $: peakY_blue = yFor(normalPdf(0, 0, blueSd));

    $: redIsShorter = peakY_red >= peakY_blue;
    $: redLabelY = redIsShorter ? peakY_red + 28 : peakY_red - 12;
    $: blueLabelY = redIsShorter ? peakY_blue - 12 : peakY_blue + 28;

    // Position text below are above curve to avoid collision
    function leaderEnd(dotY: number, labelY: number): number {
        return labelY < dotY ? labelY + 6 : labelY - 20;
    }

    $: redLeaderEnd = leaderEnd(peakY_red, redLabelY);
    $: blueLeaderEnd = leaderEnd(peakY_blue, blueLabelY);

    $: actualX_red = hasActual ? xFor(actualRed!) : 0;
    $: actualX_blue = hasActual ? xFor(actualBlue!) : 0;

    $: actualRedLabelY = HEIGHT - PAD_BOTTOM + 20;
    $: actualBlueLabelY = HEIGHT - PAD_BOTTOM + 50;

    $: actualRedCurveY = hasActual ? yFor(normalPdf(actualRed!, pred.redScore, redSd)) : 0;
    $: actualBlueCurveY = hasActual ? yFor(normalPdf(actualBlue!, pred.blueScore, blueSd)) : 0;
</script>

<div class="section">
    <h3>EPA Prediction</h3>

    <div class="summary">
        <span class="pred-line">
            Predicted: <b class="red">{Math.round(pred.redScore)}</b> -
            <b class="blue">{Math.round(pred.blueScore)}</b>
            (<b class={favoredIsRed ? "red" : "blue"}
                >{Math.round(favoredProb * 100)}% {favoredIsRed ? "Red" : "Blue"}</b
            >)
        </span>
        {#if hasActual}
            <span class="actual-line">
                Actual: <b class="red">{actualRed}</b> - <b class="blue">{actualBlue}</b>
            </span>
        {/if}
    </div>

    <!-- The desktop nice charts (doesnt show on mobile)   -->
    <div class="chart-full">
        <svg
            viewBox="0 0 {WIDTH} {HEIGHT}"
            class="chart"
            role="img"
            aria-label="Predicted score distributions"
        >
            <defs>
                <pattern
                    id="overlap-stripes"
                    width="10"
                    height="10"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                >
                    <rect width="5" height="10" x="0" class="stripe-red" />
                    <rect width="5" height="10" x="5" class="stripe-blue" />
                </pattern>
            </defs>

            <path d={fillPath(pred.blueScore, blueSd)} class="fill blue-fill" />
            <path d={fillPath(pred.redScore, redSd)} class="fill red-fill" />
            <path
                d={overlapPath(pred.redScore, redSd, pred.blueScore, blueSd)}
                class="overlap-fill"
            />

            <path d={curvePath(pred.blueScore, blueSd)} class="curve blue-curve" fill="none" />
            <path d={curvePath(pred.redScore, redSd)} class="curve red-curve" fill="none" />

            {#if hasActual}
                <line
                    x1={actualX_red}
                    x2={actualX_red}
                    y1={actualRedCurveY}
                    y2={HEIGHT - PAD_BOTTOM}
                    class="actual-marker red-marker"
                />
                <line
                    x1={actualX_blue}
                    x2={actualX_blue}
                    y1={actualBlueCurveY}
                    y2={actualBlueLabelY - 25}
                    class="actual-marker blue-marker"
                />
            {/if}

            <line
                x1={peakX_red}
                x2={peakX_red}
                y1={peakY_red}
                y2={redLeaderEnd}
                class="leader red-leader"
            />
            <line
                x1={peakX_blue}
                x2={peakX_blue}
                y1={peakY_blue}
                y2={blueLeaderEnd}
                class="leader blue-leader"
            />
            <text
                x={peakX_red}
                y={redLabelY}
                class="peak-label red-peak-label"
                text-anchor="middle"
            >
                {Math.round(pred.redScore)}
            </text>
            <text
                x={peakX_blue}
                y={blueLabelY}
                class="peak-label blue-peak-label"
                text-anchor="middle"
            >
                {Math.round(pred.blueScore)}
            </text>
            <circle cx={peakX_red} cy={peakY_red} r="4" class="peak-dot red-peak-dot" />
            <circle cx={peakX_blue} cy={peakY_blue} r="4" class="peak-dot blue-peak-dot" />

            {#if hasActual}
                <text
                    x={actualX_red}
                    y={actualRedLabelY}
                    class="marker-label red-marker-label"
                    text-anchor="middle"
                >
                    {actualRed}
                </text>
                <text
                    x={actualX_blue}
                    y={actualBlueLabelY}
                    class="marker-label blue-marker-label"
                    text-anchor="middle"
                >
                    {actualBlue}
                </text>
            {/if}
        </svg>
    </div>

    <!-- Phones just a bar -->
    <div class="chart-mobile">
        <div
            class="prob-bar"
            role="img"
            aria-label="Win probability: {Math.round(pred.redWinProb * 100)}% red, {Math.round(
                (1 - pred.redWinProb) * 100
            )}% blue"
        >
            <div class="prob-seg prob-seg-red" style="width: {pred.redWinProb * 100}%" />
            <div class="prob-seg prob-seg-blue" style="width: {(1 - pred.redWinProb) * 100}%" />
        </div>
        <div class="prob-labels">
            <span class="red">{Math.round(pred.redWinProb * 100)}% Red</span>
            <span class="blue">{Math.round((1 - pred.redWinProb) * 100)}% Blue</span>
        </div>
    </div>
</div>

<style>
    .section {
        margin-top: var(--lg-gap);
        padding-top: var(--md-gap);
        border-top: 1px solid var(--sep-color);
    }

    h3 {
        font-size: var(--lg-font-size);
        margin-bottom: var(--sm-gap);
    }

    .summary {
        display: flex;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--sm-gap);
        margin-bottom: var(--sm-gap);
        font-size: var(--md-font-size);
    }

    .red {
        color: var(--red-team-text-color);
    }

    .blue {
        color: var(--blue-team-text-color);
    }

    .chart {
        display: block;
        width: 100%;
        max-width: 540px;
        margin: 0 auto;
        height: auto;
        overflow: visible;
    }

    .fill {
        opacity: 0.25;
    }

    .red-fill {
        fill: var(--red-team-color);
    }

    .blue-fill {
        fill: var(--blue-team-color);
    }

    .overlap-fill {
        fill: url(#overlap-stripes);
    }

    .stripe-red {
        fill: var(--red-team-color);
        opacity: 0.55;
    }

    .stripe-blue {
        fill: var(--blue-team-color);
        opacity: 0.55;
    }

    .curve {
        stroke-width: 2;
    }

    .red-curve {
        stroke: var(--red-team-text-color);
    }

    .blue-curve {
        stroke: var(--blue-team-text-color);
    }

    .actual-marker {
        stroke-width: 2;
        stroke-dasharray: 4 3;
    }

    .red-marker {
        stroke: var(--red-team-text-color);
    }

    .blue-marker {
        stroke: var(--blue-team-text-color);
    }

    .marker-label {
        font-size: 24px;
        font-weight: 700;
        paint-order: stroke;
        stroke: var(--modal-bg-color);
        stroke-width: 3px;
        stroke-linejoin: round;
    }

    .red-marker-label {
        fill: var(--red-team-text-color);
    }

    .blue-marker-label {
        fill: var(--blue-team-text-color);
    }

    .peak-label {
        font-size: 28px;
        font-weight: 700;
        paint-order: stroke;
        stroke: var(--modal-bg-color);
        stroke-width: 3px;
        stroke-linejoin: round;
    }

    .red-peak-label {
        fill: var(--red-team-text-color);
    }

    .blue-peak-label {
        fill: var(--blue-team-text-color);
    }

    .peak-dot {
        stroke: var(--modal-bg-color);
        stroke-width: 1.5;
    }

    .red-peak-dot {
        fill: var(--red-team-text-color);
    }

    .blue-peak-dot {
        fill: var(--blue-team-text-color);
    }

    .leader {
        stroke-width: 1.5;
    }

    .red-leader {
        stroke: var(--red-team-text-color);
    }

    .blue-leader {
        stroke: var(--blue-team-text-color);
    }

    .chart-mobile {
        display: none;
    }

    .prob-bar {
        display: flex;
        width: 100%;
        height: 28px;
        border-radius: 6px;
        overflow: hidden;
    }

    .prob-seg-red {
        background: var(--red-team-color);
    }

    .prob-seg-blue {
        background: var(--blue-team-color);
    }

    .prob-labels {
        display: flex;
        justify-content: space-between;
        margin-top: var(--sm-gap);
        font-size: var(--sm-font-size);
        font-weight: bold;
    }

    @media (max-width: 550px) {
        .chart-full {
            display: none;
        }

        .chart-mobile {
            display: block;
        }
    }
</style>
