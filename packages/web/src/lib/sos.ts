import { winProbability } from "@ftc-scout/common";
import { Alliance, TournamentLevel } from "./graphql/generated/graphql-operations";
import { seededRandom, shuffle } from "./util/random";

/**
 * Strength of schedule, statbotics.io/blog/sos): each team's
 * Each percentile is the share of random schedules that are easier than the actual one,
 * so 0.5 is an average schedule and higher is harder.
 */
export type Sos = {
    /** The average of the three percentiles. */
    composite: number;

    deltaEpa: number;
    epaPercentile: number;
    expectedWins: number;
    /** Expected wins compared with random schedules'. */
    deltaWins: number;
    winsPercentile: number;
    expectedRank: number;
    deltaRank: number;
    rankPercentile: number;
};

type SosMatch = {
    tournamentLevel: TournamentLevel;
    teams: { teamNumber: number; alliance: Alliance; surrogate: boolean }[];
    epaPrediction?: { redSigma: number; blueSigma: number } | null;
};

type Template = {
    team: Int32Array;
    surrogate: Uint8Array;
    redStart: Int32Array;
    blueStart: Int32Array;
};

type Result = {
    deltaEpa: Float64Array;
    winRate: Float64Array;
    rank: Float64Array;
};

const SIMULATIONS = 500;

/**
 * use sudo random with seed, for hydration with ssr
 */
export function scheduleStrength(
    matches: SosMatch[],
    epas: Map<number, number | null | undefined>,
    seed: string,
    simulations = SIMULATIONS
): Map<number, Sos> {
    let quals = matches.filter(
        (m) =>
            m.tournamentLevel == TournamentLevel.Quals &&
            m.teams.some((t) => t.alliance == Alliance.Red) &&
            m.teams.some((t) => t.alliance == Alliance.Blue)
    );
    let teams = [...new Set(quals.flatMap((m) => m.teams.map((t) => t.teamNumber)))].sort(
        (a, b) => a - b
    );
    let known = teams.map((t) => epas.get(t)).filter((e): e is number => e != null);
    if (teams.length < 4 || !known.length) return new Map();

    let index = new Map(teams.map((t, i) => [t, i]));
    let mean = known.reduce((a, b) => a + b, 0) / known.length;
    let epa = teams.map((t) => epas.get(t) ?? mean);
    let template = makeTemplate(quals, index);
    let sigma = teamSigma(quals, epa);

    let actual = evaluate(template, identity(teams.length), epa, mean, sigma);

    let random = seededRandom(seed);
    let deltaEpaSum = new Float64Array(teams.length);
    let winRateSum = new Float64Array(teams.length);
    let rankSum = new Float64Array(teams.length);
    let easierEpa = new Float64Array(teams.length);
    let easierWins = new Float64Array(teams.length);
    let easierRank = new Float64Array(teams.length);
    let perm = identity(teams.length);
    for (let s = 0; s < simulations; s++) {
        shuffle(perm, random);
        let r = evaluate(template, perm, epa, mean, sigma);
        for (let i = 0; i < teams.length; i++) {
            deltaEpaSum[i] += r.deltaEpa[i];
            winRateSum[i] += r.winRate[i];
            rankSum[i] += r.rank[i];
            easierEpa[i] += compare(r.deltaEpa[i], actual.deltaEpa[i]);
            easierWins[i] += compare(r.winRate[i], actual.winRate[i]);
            easierRank[i] += compare(actual.rank[i], r.rank[i]);
        }
    }

    let counts = new Float64Array(teams.length);
    template.team.forEach((t, i) => template.surrogate[i] || counts[t]++);

    let result = new Map<number, Sos>();
    teams.forEach((team, i) => {
        if (!counts[i]) return;
        let epaPercentile = easierEpa[i] / simulations;
        let winsPercentile = easierWins[i] / simulations;
        let rankPercentile = easierRank[i] / simulations;
        result.set(team, {
            composite: (epaPercentile + winsPercentile + rankPercentile) / 3,
            deltaEpa: actual.deltaEpa[i],
            epaPercentile,
            expectedWins: actual.winRate[i] * counts[i],
            deltaWins: (actual.winRate[i] - winRateSum[i] / simulations) * counts[i],
            winsPercentile,
            expectedRank: actual.rank[i],
            deltaRank: actual.rank[i] - rankSum[i] / simulations,
            rankPercentile,
        });
    });
    return result;
}

export function teamSigma(
    matches: Pick<SosMatch, "teams" | "epaPrediction">[],
    epa: number[]
): number {
    let variances = matches.flatMap((m) =>
        m.epaPrediction
            ? [
                  m.epaPrediction.redSigma ** 2 /
                      m.teams.filter((t) => t.alliance == Alliance.Red).length,
                  m.epaPrediction.blueSigma ** 2 /
                      m.teams.filter((t) => t.alliance == Alliance.Blue).length,
              ]
            : []
    );
    if (variances.length) {
        variances.sort((a, b) => a - b);
        let median = variances[Math.floor(variances.length / 2)];
        if (median > 0) return Math.sqrt(median);
    }
    let mean = epa.reduce((a, b) => a + b, 0) / epa.length;
    let sd = Math.sqrt(epa.reduce((a, e) => a + (e - mean) ** 2, 0) / epa.length);
    return sd > 0 ? sd : 1;
}

function makeTemplate(quals: SosMatch[], index: Map<number, number>): Template {
    let team: number[] = [];
    let surrogate: number[] = [];
    let redStart: number[] = [];
    let blueStart: number[] = [];
    for (let m of quals) {
        for (let alliance of [Alliance.Red, Alliance.Blue]) {
            (alliance == Alliance.Red ? redStart : blueStart).push(team.length);
            for (let t of m.teams) {
                if (t.alliance != alliance) continue;
                team.push(index.get(t.teamNumber)!);
                surrogate.push(+t.surrogate);
            }
        }
    }
    redStart.push(team.length);
    return {
        team: Int32Array.from(team),
        surrogate: Uint8Array.from(surrogate),
        redStart: Int32Array.from(redStart),
        blueStart: Int32Array.from(blueStart),
    };
}

function evaluate(
    template: Template,
    perm: Int32Array,
    epa: number[],
    mean: number,
    sigma: number
): Result {
    let { team, surrogate, redStart, blueStart } = template;
    let n = epa.length;
    let deltaEpa = new Float64Array(n);
    let wins = new Float64Array(n);
    let played = new Float64Array(n);
    let add = (from: number, to: number, ownSum: number, oppSum: number, p: number) => {
        for (let i = from; i < to; i++) {
            if (surrogate[i]) continue;
            let t = perm[team[i]];
            // The team counts as average: the partners' EPA less the opponents'.
            deltaEpa[t] += ownSum - epa[t] + mean - oppSum;
            wins[t] += p;
            played[t]++;
        }
    };
    for (let m = 0; m < blueStart.length; m++) {
        let r = redStart[m];
        let b = blueStart[m];
        let end = redStart[m + 1];
        let red = 0;
        let blue = 0;
        for (let i = r; i < b; i++) red += epa[perm[team[i]]];
        for (let i = b; i < end; i++) blue += epa[perm[team[i]]];
        let pRed = winProbability(red, blue, sigma * Math.sqrt(end - r));
        add(r, b, red, blue, pRed);
        add(b, end, blue, red, 1 - pRed);
    }
    let winRate = new Float64Array(n);
    for (let t = 0; t < n; t++) {
        if (played[t]) {
            deltaEpa[t] /= played[t];
            winRate[t] = wins[t] / played[t];
        }
    }
    // Ties share the average of their places.
    let sorted = winRate.slice().sort();
    let rank = new Float64Array(n);
    for (let t = 0; t < n; t++) {
        let below = lowerBound(sorted, winRate[t]);
        let notAbove = lowerBound(sorted, winRate[t], true);
        rank[t] = n - notAbove + (notAbove - below + 1) / 2;
    }
    return { deltaEpa, winRate, rank };
}

function lowerBound(sorted: Float64Array, x: number, orEqual = false): number {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
        let mid = (lo + hi) >> 1;
        if (sorted[mid] < x || (orEqual && sorted[mid] == x)) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

/** random > actual = 1
 * random == actual = 0.5
 * random < actual = 0*/
function compare(random: number, actual: number): number {
    return random > actual + 1e-9 ? 1 : random < actual - 1e-9 ? 0 : 0.5;
}

function identity(n: number): Int32Array {
    let a = new Int32Array(n);
    for (let i = 0; i < n; i++) a[i] = i;
    return a;
}
