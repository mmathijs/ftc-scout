import { Alliance } from "../Alliance";
import { Match, filterQualsMatches, hasAllianceScores } from "./shared-stats-utils";

// Copied methodology from https://statcube.vercel.app/methodology)
// Did change the factors of margin_signal and the points_signal
// Also added a rolling refit for higher EPA's

const DAY_MS = 24 * 3600 * 1000;

export interface TaylorsLawFit {
    a: number;
    b: number;
}

export interface EpaParams {
    /** k-factor, check statcube for info. */
    kMaxFraction: number;
    kMinFraction: number;
    warmupMatches: number;
    stableMatches: number;

    /** Only use team dependent fits after enough data, tuned on [fitWindowStartDays,
     *  fitWindowEndDays] after the season's first match. Otherwise everyone has the same sd */
    fitWindowStartDays: number;
    fitWindowEndDays: number;

    /** Switch to rolling window for refitting after fitWindowEndDays. Helps for slight accuracy
     * with higher EPA teams later on in the season. */
    rollingWindowDays: number;
    refitEveryDays: number;

    /** Weights fot the margin and the points-added signals for the EPA formulas */
    marginWeight: number;
    pointsWeight: number;
}

// Tuned on previous years matches to be the most accurate
export const DEFAULT_EPA_PARAMS: EpaParams = {
    kMaxFraction: 0.4,
    kMinFraction: 0.2,
    warmupMatches: 6,
    stableMatches: 12,
    fitWindowStartDays: 14,
    fitWindowEndDays: 45,
    rollingWindowDays: 30,
    refitEveryDays: 1,
    marginWeight: 0.25,
    pointsWeight: 1.5,
};

export interface TeamEpaState {
    epa: number;
    matchesPlayed: number;
}

export interface RunningStat {
    count: number;
    mean: number;
    m2: number;
}

export function emptyRunningStat(): RunningStat {
    return { count: 0, mean: 0, m2: 0 };
}

export function addObservation(stat: RunningStat, x: number): RunningStat {
    let count = stat.count + 1;
    let delta = x - stat.mean;
    let mean = stat.mean + delta / count;
    let delta2 = x - mean;
    let m2 = stat.m2 + delta * delta2;
    return { count, mean, m2 };
}

export function stdDev(stat: RunningStat): number {
    if (stat.count < 2) return 0;
    return Math.sqrt(stat.m2 / (stat.count - 1));
}

// Aproximation of erf
function erf(x: number): number {
    let sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    let a1 = 0.254829592,
        a2 = -0.284496736,
        a3 = 1.421413741,
        a4 = -1.453152027,
        a5 = 1.061405429,
        p = 0.3275911;
    let t = 1 / (1 + p * x);
    let y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
}

function normalCdf(z: number): number {
    return 0.5 * (1 + erf(z / Math.SQRT2));
}

export function winProbability(
    epaRedSum: number,
    epaBlueSum: number,
    combinedSigma: number
): number {
    if (combinedSigma <= 0) return 0.5;
    let z = (epaRedSum - epaBlueSum) / combinedSigma;
    return normalCdf(z);
}

// sigma = a * EPA^b
function sigmaFor(fit: TaylorsLawFit, epaValue: number): number {
    return fit.a * Math.pow(Math.max(epaValue, 1), fit.b);
}

// Ordinary least squares, aka find the lowest error (needs 10 matches to somewhat accurate)
function fitTaylorsLaw(points: { mean: number; sd: number }[]): TaylorsLawFit | null {
    if (points.length < 10) return null;
    let xs = points.map((p) => Math.log(p.mean));
    let ys = points.map((p) => Math.log(p.sd));
    let n = xs.length;
    let sumX = xs.reduce((a, b) => a + b, 0);
    let sumY = ys.reduce((a, b) => a + b, 0);
    let sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
    let sumXX = xs.reduce((s, x) => s + x * x, 0);
    let denom = n * sumXX - sumX * sumX;
    if (Math.abs(denom) < 1e-9) return null;
    let b = (n * sumXY - sumX * sumY) / denom;
    let a = Math.exp((sumY - b * sumX) / n);
    if (!isFinite(a) || !isFinite(b) || a <= 0) return null;
    return { a, b };
}

function matchTimeMs(m: unknown): number | null {
    let obj = m as Record<string, unknown>;
    let t = obj.actualStartTime ?? obj.scheduledStartTime ?? obj.postResultTime;
    if (t == null) return null;
    let d = t instanceof Date ? t : new Date(t as string | number);
    let ms = d.getTime();
    return isNaN(ms) ? null : ms;
}

// Find the fit using statcube's implementation
function collectFitSamples<M extends Match>(
    matches: M[],
    windowStart: number,
    windowEnd: number
): { mean: number; sd: number }[] {
    let byTeam = new Map<number, number[]>();
    for (let m of matches) {
        let t = matchTimeMs(m);
        if (t == null || t < windowStart || t >= windowEnd) continue;
        if (!hasAllianceScores(m.scores)) continue;
        for (let alliance of [Alliance.Red, Alliance.Blue]) {
            let allianceTeams = m.teams.filter((tm) => tm.alliance === alliance && !tm.surrogate);
            if (allianceTeams.length !== 2) continue;
            let score = alliance === Alliance.Red ? m.scores.red : m.scores.blue;
            let val = score.totalPoints;
            for (let tm of allianceTeams) {
                if (!byTeam.has(tm.teamNumber)) byTeam.set(tm.teamNumber, []);
                byTeam.get(tm.teamNumber)!.push(val);
            }
        }
    }
    let points: { mean: number; sd: number }[] = [];
    for (let vals of byTeam.values()) {
        if (vals.length < 3) continue;
        let mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        if (mean <= 0) continue;
        let variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length - 1);
        let sd = Math.sqrt(variance);
        if (sd <= 0) continue;
        points.push({ mean: mean / 2, sd });
    }
    return points;
}

export interface EpaPredictionInput {
    epa: number;
}

export interface MatchScorePrediction {
    redScore: number;
    blueScore: number;
    redWinProb: number;
    redSigma: number;
    blueSigma: number;
}

// Use SD and EPA's of both teams (basic x1 + x2, sqrt(s1^2 + s2^2))
export function predictMatch(
    red: [EpaPredictionInput, EpaPredictionInput],
    blue: [EpaPredictionInput, EpaPredictionInput],
    fit: TaylorsLawFit | null
): MatchScorePrediction {
    let redScore = red[0].epa + red[1].epa;
    let blueScore = blue[0].epa + blue[1].epa;

    let teamSigma = (t: EpaPredictionInput) => (fit ? sigmaFor(fit, t.epa) : 0);
    let redSigma = Math.sqrt(teamSigma(red[0]) ** 2 + teamSigma(red[1]) ** 2);
    let blueSigma = Math.sqrt(teamSigma(blue[0]) ** 2 + teamSigma(blue[1]) ** 2);
    let combinedSigma = Math.sqrt(redSigma * redSigma + blueSigma * blueSigma);

    let redWinProb = winProbability(redScore, blueScore, combinedSigma);
    return { redScore, blueScore, redWinProb, redSigma, blueSigma };
}

export interface MatchPrediction {
    matchId: number;
    eventCode: string;
    predRedWinProb: number;

    /** 1 = red won, 0 = blue won, 0.5 = tie. */
    actualOutcome: number;

    /** Only use this prediction for accuracy stats if the first window is over and sigmas exist */
    eligibleForScoring: boolean;
    predRedScore: number;
    predBlueScore: number;
    actualRedScore: number;
    actualBlueScore: number;
}

export interface TeamEpaSnapshot {
    teamNumber: number;
    matchId: number;
    eventCode: string;
    epa: number;
    matchesPlayed: number;
}

export interface SeasonEpaResult {
    teamEpas: Record<number, TeamEpaState>;
    totalStat: RunningStat;
    predictions: MatchPrediction[];
    /** One entry per team per match, with the new EPA after the match. */
    history: TeamEpaSnapshot[];
    /** Fit results, only if it is after the window. */
    fit: TaylorsLawFit | null;
    /** ms time of the first ever match (used for start of window) */
    firstTime: number | null;
    /** Used for incremental EPA calculations. */
    lastMatch: { time: number | null; matchId: number; eventCode: string } | null;
}

function kFactorFor(params: EpaParams, matchesPlayed: number, seasonMean: number): number {
    let kmax = params.kMaxFraction * Math.abs(seasonMean);
    let kmin = params.kMinFraction * Math.abs(seasonMean);
    if (matchesPlayed <= params.warmupMatches) return kmax;
    if (matchesPlayed >= params.stableMatches) return kmin;
    let frac =
        (matchesPlayed - params.warmupMatches) / (params.stableMatches - params.warmupMatches);
    return kmax - frac * (kmax - kmin);
}

interface CoreEpaState {
    teamEpas: Record<number, TeamEpaState>;
    totalStat: RunningStat;
}

// Actually calculate the EPA changes after a match
function stepMatch<M extends Match>(
    core: CoreEpaState,
    m: M,
    params: EpaParams,
    fit: TaylorsLawFit | null,
    eligibleForScoring: boolean
): { history: TeamEpaSnapshot[]; prediction: MatchPrediction } | null {
    if (!hasAllianceScores(m.scores)) return null;

    let redTeams = m.teams.filter((t) => t.alliance === Alliance.Red && !t.surrogate);
    let blueTeams = m.teams.filter((t) => t.alliance === Alliance.Blue && !t.surrogate);
    if (redTeams.length !== 2 || blueTeams.length !== 2) return null;

    let matchId = (m as any).id ?? 0;
    let eventCode = (m as any).eventCode ?? "";

    let history: TeamEpaSnapshot[] = [];
    let ensure = (teamNumber: number) => {
        if (!core.teamEpas[teamNumber]) {
            let epa = core.totalStat.count > 0 ? core.totalStat.mean / 2 : 0;
            let cold: TeamEpaState = { epa, matchesPlayed: 0 };
            core.teamEpas[teamNumber] = cold;
            history.push({ teamNumber, matchId, eventCode, epa: cold.epa, matchesPlayed: 0 });
        }
        return core.teamEpas[teamNumber];
    };

    let r1 = ensure(redTeams[0].teamNumber);
    let r2 = ensure(redTeams[1].teamNumber);
    let b1 = ensure(blueTeams[0].teamNumber);
    let b2 = ensure(blueTeams[1].teamNumber);

    let red = m.scores.red;
    let blue = m.scores.blue;

    let predRed = r1.epa + r2.epa;
    let predBlue = b1.epa + b2.epa;

    let sigmaOf = (epaValue: number) => (fit ? sigmaFor(fit, epaValue) : stdDev(core.totalStat));
    let sigmaRed = Math.sqrt(sigmaOf(r1.epa) ** 2 + sigmaOf(r2.epa) ** 2);
    let sigmaBlue = Math.sqrt(sigmaOf(b1.epa) ** 2 + sigmaOf(b2.epa) ** 2);
    let combinedSigma = Math.sqrt(sigmaRed * sigmaRed + sigmaBlue * sigmaBlue);

    let predRedWinProb = winProbability(predRed, predBlue, combinedSigma);
    let actualOutcome =
        red.totalPoints > blue.totalPoints ? 1 : red.totalPoints < blue.totalPoints ? 0 : 0.5;

    let prediction: MatchPrediction = {
        matchId,
        eventCode,
        predRedWinProb,
        actualOutcome,
        eligibleForScoring,
        predRedScore: predRed,
        predBlueScore: predBlue,
        actualRedScore: red.totalPoints,
        actualBlueScore: blue.totalPoints,
    };

    let eM = red.totalPoints - blue.totalPoints - (predRed - predBlue);
    let zM = combinedSigma > 0 ? eM / combinedSigma : 0;
    let kMarginRed = normalCdf(zM) - 0.5;
    let kMarginBlue = -kMarginRed;

    let kPointsRed = sigmaRed > 0 ? normalCdf((red.totalPoints - predRed) / sigmaRed) - 0.5 : 0;
    let kPointsBlue =
        sigmaBlue > 0 ? normalCdf((blue.totalPoints - predBlue) / sigmaBlue) - 0.5 : 0;

    let seasonMean = core.totalStat.mean;
    let redSignal = params.marginWeight * kMarginRed + params.pointsWeight * kPointsRed;
    let blueSignal = params.marginWeight * kMarginBlue + params.pointsWeight * kPointsBlue;
    r1.epa += kFactorFor(params, r1.matchesPlayed, seasonMean) * redSignal;
    r2.epa += kFactorFor(params, r2.matchesPlayed, seasonMean) * redSignal;
    b1.epa += kFactorFor(params, b1.matchesPlayed, seasonMean) * blueSignal;
    b2.epa += kFactorFor(params, b2.matchesPlayed, seasonMean) * blueSignal;

    for (let team of [r1, r2, b1, b2]) team.matchesPlayed += 1;

    history.push(
        {
            teamNumber: redTeams[0].teamNumber,
            matchId,
            eventCode,
            epa: r1.epa,
            matchesPlayed: r1.matchesPlayed,
        },
        {
            teamNumber: redTeams[1].teamNumber,
            matchId,
            eventCode,
            epa: r2.epa,
            matchesPlayed: r2.matchesPlayed,
        },
        {
            teamNumber: blueTeams[0].teamNumber,
            matchId,
            eventCode,
            epa: b1.epa,
            matchesPlayed: b1.matchesPlayed,
        },
        {
            teamNumber: blueTeams[1].teamNumber,
            matchId,
            eventCode,
            epa: b2.epa,
            matchesPlayed: b2.matchesPlayed,
        }
    );

    core.totalStat = addObservation(
        addObservation(core.totalStat, red.totalPoints),
        blue.totalPoints
    );

    return { history, prediction };
}

export function computeSeasonEpas<M extends Match>(
    sortedQualMatches: M[],
    params: EpaParams = DEFAULT_EPA_PARAMS
): SeasonEpaResult {
    let matches = filterQualsMatches(sortedQualMatches).filter((m) => hasAllianceScores(m.scores));

    let core: CoreEpaState = { teamEpas: {}, totalStat: emptyRunningStat() };
    let predictions: MatchPrediction[] = [];
    let history: TeamEpaSnapshot[] = [];

    if (matches.length === 0) {
        return {
            teamEpas: core.teamEpas,
            totalStat: core.totalStat,
            predictions,
            history,
            fit: null,
            firstTime: null,
            lastMatch: null,
        };
    }

    let firstTime = matches.map((m) => matchTimeMs(m)).find((t) => t != null) ?? 0;
    let windowStart = firstTime + params.fitWindowStartDays * DAY_MS;
    let windowEnd = firstTime + params.fitWindowEndDays * DAY_MS;

    let fit = fitTaylorsLaw(collectFitSamples(matches, windowStart, windowEnd));
    let lastRefitTime = windowEnd;

    for (let m of matches) {
        let matchTime = matchTimeMs(m) ?? Infinity;

        if (
            matchTime !== Infinity &&
            matchTime >= windowEnd &&
            matchTime - lastRefitTime >= params.refitEveryDays * DAY_MS
        ) {
            let trailingStart = matchTime - params.rollingWindowDays * DAY_MS;
            let refit = fitTaylorsLaw(collectFitSamples(matches, trailingStart, matchTime));
            if (refit) fit = refit;
            lastRefitTime = matchTime;
        }

        let eligibleForScoring = fit != null && matchTime >= windowEnd;
        let result = stepMatch(core, m, params, fit, eligibleForScoring);
        if (!result) continue;
        history.push(...result.history);
        predictions.push(result.prediction);
    }

    let last = matches[matches.length - 1];
    return {
        teamEpas: core.teamEpas,
        totalStat: core.totalStat,
        predictions,
        history,
        fit,
        firstTime,
        lastMatch: {
            time: matchTimeMs(last),
            matchId: (last as any).id ?? 0,
            eventCode: (last as any).eventCode ?? "",
        },
    };
}

export interface EpaEngineState {
    teamEpas: Record<number, TeamEpaState>;
    totalStat: RunningStat;
    fit: TaylorsLawFit | null;
    /** ms time of the first ever match (used for start of window) */
    firstTime: number | null;
    /** Fit curves per team */
    fitSamplesByTeam: Record<number, number[]>;
}

export function emptyEngineState(): EpaEngineState {
    return {
        teamEpas: {},
        totalStat: emptyRunningStat(),
        fit: null,
        firstTime: null,
        fitSamplesByTeam: {},
    };
}

export function seedEngineState(result: SeasonEpaResult): EpaEngineState {
    return {
        teamEpas: result.teamEpas,
        totalStat: result.totalStat,
        fit: result.fit,
        firstTime: result.firstTime,
        fitSamplesByTeam: {},
    };
}

/** Moving window fitting for later on in the season */

function accumulateFitSample(
    fitSamplesByTeam: Record<number, number[]>,
    m: { teams: Match["teams"] },
    alliance: Alliance,
    totalPoints: number
) {
    let allianceTeams = m.teams.filter((tm) => tm.alliance === alliance && !tm.surrogate);
    if (allianceTeams.length !== 2) return;
    for (let tm of allianceTeams) {
        if (!fitSamplesByTeam[tm.teamNumber]) fitSamplesByTeam[tm.teamNumber] = [];
        fitSamplesByTeam[tm.teamNumber].push(totalPoints);
    }
}

function tryFitFromSamples(fitSamplesByTeam: Record<number, number[]>): TaylorsLawFit | null {
    let points: { mean: number; sd: number }[] = [];
    for (let vals of Object.values(fitSamplesByTeam)) {
        if (vals.length < 3) continue;
        let mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        if (mean <= 0) continue;
        let variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length - 1);
        let sd = Math.sqrt(variance);
        if (sd <= 0) continue;
        points.push({ mean: mean / 2, sd });
    }
    return fitTaylorsLaw(points);
}

export function applyMatchIncremental<M extends Match>(
    state: EpaEngineState,
    m: M,
    params: EpaParams = DEFAULT_EPA_PARAMS
): { history: TeamEpaSnapshot[]; prediction: MatchPrediction } | null {
    if (!hasAllianceScores(m.scores)) return null;

    let matchTime = matchTimeMs(m) ?? Infinity;
    if (state.firstTime == null) state.firstTime = matchTime === Infinity ? 0 : matchTime;

    let windowStart = state.firstTime + params.fitWindowStartDays * DAY_MS;
    let windowEnd = state.firstTime + params.fitWindowEndDays * DAY_MS;

    if (state.fit == null) {
        if (matchTime >= windowStart && matchTime < windowEnd) {
            accumulateFitSample(state.fitSamplesByTeam, m, Alliance.Red, m.scores.red.totalPoints);
            accumulateFitSample(
                state.fitSamplesByTeam,
                m,
                Alliance.Blue,
                m.scores.blue.totalPoints
            );
        }
        if (matchTime >= windowEnd) {
            state.fit = tryFitFromSamples(state.fitSamplesByTeam);
            if (state.fit != null) state.fitSamplesByTeam = {};
        }
    }

    let eligibleForScoring = state.fit != null && matchTime >= windowEnd;
    return stepMatch(state, m, params, state.fit, eligibleForScoring);
}

export interface PredictionMetrics {
    n: number;
    accuracy: number;
    brierScore: number;
    logLoss: number;
    /** Mean/RMS of absolute errors */
    scoreMae: number;
    scoreRmse: number;
}

// Not used in code, but used for accuracy testing locally
export function scorePredictions(predictions: MatchPrediction[]): PredictionMetrics {
    let eligible = predictions.filter((p) => p.eligibleForScoring);
    let classEligible = eligible.filter((p) => p.actualOutcome !== 0.5);
    let n = classEligible.length;

    let correct = 0;
    let brierSum = 0;
    let logLossSum = 0;
    let eps = 1e-9;

    for (let p of classEligible) {
        let predictedWinner = p.predRedWinProb >= 0.5 ? 1 : 0;
        if (predictedWinner === p.actualOutcome) correct += 1;

        brierSum += (p.predRedWinProb - p.actualOutcome) ** 2;

        let clamped = Math.min(1 - eps, Math.max(eps, p.predRedWinProb));
        logLossSum -=
            p.actualOutcome * Math.log(clamped) + (1 - p.actualOutcome) * Math.log(1 - clamped);
    }

    let absErrSum = 0;
    let sqErrSum = 0;
    for (let p of eligible) {
        let redErr = p.predRedScore - p.actualRedScore;
        let blueErr = p.predBlueScore - p.actualBlueScore;
        absErrSum += Math.abs(redErr) + Math.abs(blueErr);
        sqErrSum += redErr * redErr + blueErr * blueErr;
    }
    let scoreN = eligible.length * 2;

    return {
        n,
        accuracy: n > 0 ? correct / n : 0,
        brierScore: n > 0 ? brierSum / n : 0,
        logLoss: n > 0 ? logLossSum / n : 0,
        scoreMae: scoreN > 0 ? absErrSum / scoreN : 0,
        scoreRmse: scoreN > 0 ? Math.sqrt(sqErrSum / scoreN) : 0,
    };
}
