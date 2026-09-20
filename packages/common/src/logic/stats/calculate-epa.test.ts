import { describe, expect, it } from "vitest";
import { Alliance } from "../Alliance";
import { Station } from "../Station";
import { TournamentLevel } from "../TournamentLevel";
import { Match } from "./shared-stats-utils";
import {
    EpaParams,
    addObservation,
    applyMatchIncremental,
    computeSeasonEpas,
    DEFAULT_EPA_PARAMS,
    emptyRunningStat,
    scorePredictions,
    seedEngineState,
    stdDev,
    winProbability,
} from "./calculate-epa";

const DAY_MS = 24 * 3600 * 1000;
const SEASON_START = Date.parse("2026-01-01T00:00:00Z");

function tm(teamNumber: number, alliance: Alliance): Match["teams"][number] {
    return {
        matchId: 0,
        teamNumber,
        alliance,
        station: Station.One,
        surrogate: false,
        dq: false,
        onField: true,
    };
}

function score(alliance: Alliance, totalPoints: number, autoPoints: number, dcPoints: number) {
    return {
        matchId: 0,
        alliance,
        totalPoints,
        totalPointsNp: totalPoints,
        autoPoints,
        dcPoints,
    };
}

// dayOffset places the match at SEASON_START + dayOffset days - needed since the Taylor's Law
// fit window (and eligibility gating) is keyed off real match time, not just processing order.
function match(
    red: [number, number],
    blue: [number, number],
    redScore: [number, number, number],
    blueScore: [number, number, number],
    dayOffset = 0
): Match & { scheduledStartTime: Date } {
    return {
        tournamentLevel: TournamentLevel.Quals,
        teams: [
            tm(red[0], Alliance.Red),
            tm(red[1], Alliance.Red),
            tm(blue[0], Alliance.Blue),
            tm(blue[1], Alliance.Blue),
        ],
        scores: { red: score(Alliance.Red, ...redScore), blue: score(Alliance.Blue, ...blueScore) },
        scheduledStartTime: new Date(SEASON_START + dayOffset * DAY_MS),
    };
}

// One round-robin round of 12 matches at a given day offset - shared by the fit-window test
// below and applyMatchIncremental's full-replay-parity test. Score varies by team (i) and round
// (jitter) so the fit has real cross-team spread and nonzero per-team variance to regress against.
function makeRound(dayOffset: number): Match[] {
    let round: Match[] = [];
    for (let i = 0; i < 12; i++) {
        let red: [number, number] = [i * 2 + 1, i * 2 + 2];
        let blue: [number, number] = [((i + 1) % 12) * 2 + 1, ((i + 1) % 12) * 2 + 2];
        let jitter = (dayOffset * 7) % 11;
        round.push(
            match(
                red,
                blue,
                [90 + i * 3 + jitter, 40 + i * 3 + jitter, 50 + i * 2 + jitter],
                [85 - i * 3 - jitter, 38 - i * 2 - jitter, 47 - i - jitter],
                dayOffset
            )
        );
    }
    return round;
}

describe("RunningStat (Welford's algorithm)", () => {
    it("matches the textbook sample mean/stddev for a known dataset", () => {
        // classic example: mean 5, sample stddev sqrt(32/7)
        let values = [2, 4, 4, 4, 5, 5, 7, 9];
        let stat = values.reduce(addObservation, emptyRunningStat());

        expect(stat.mean).toBeCloseTo(5, 10);
        expect(stdDev(stat)).toBeCloseTo(Math.sqrt(32 / 7), 10);
    });

    it("returns 0 stddev for fewer than 2 observations", () => {
        expect(stdDev(emptyRunningStat())).toBe(0);
        expect(stdDev(addObservation(emptyRunningStat(), 42))).toBe(0);
    });
});

describe("winProbability", () => {
    it("is exactly 0.5 when both alliances have equal EPA", () => {
        expect(winProbability(100, 100, 20)).toBeCloseTo(0.5, 6);
    });

    it("falls back to 0.5 when there's no combined sigma yet", () => {
        expect(winProbability(500, 0, 0)).toBe(0.5);
    });

    it("is symmetric: P(red) + P(blue) == 1", () => {
        let pRed = winProbability(120, 90, 15);
        let pBlue = winProbability(90, 120, 15);
        expect(pRed + pBlue).toBeCloseTo(1, 6);
    });

    it("matches the standard normal CDF at a known z-value", () => {
        // z = (red - blue) / combinedSigma = 1  =>  winProb = Phi(1) ~= 0.8413447
        expect(winProbability(10, 0, 10)).toBeCloseTo(0.8413447, 6);
    });
});

describe("computeSeasonEpas", () => {
    it("a fresh season's first match produces zero EPA change", () => {
        // No variance estimate exists yet (stdDev falls back to 0), so the z-scores are
        // undefined and the update guards to exactly 0.
        let m = match([1, 2], [3, 4], [100, 40, 60], [80, 30, 50], 0);
        let { teamEpas } = computeSeasonEpas([m]);

        for (let team of [1, 2, 3, 4]) {
            expect(teamEpas[team].epa).toBeCloseTo(0, 10);
            expect(teamEpas[team].matchesPlayed).toBe(1);
        }
    });

    it("cold-starts brand new teams at half the season-so-far total-score mean, not zero", () => {
        let m1 = match([1, 2], [3, 4], [100, 40, 60], [80, 30, 50], 0);
        // total mean after match 1: mean(100,80)=90 -> cold epa = 45.
        let m2 = match([5, 6], [7, 8], [130, 60, 70], [90, 35, 55], 1);

        let { history } = computeSeasonEpas([m1, m2]);

        let coldTeam5 = history.find((h) => h.teamNumber == 5 && h.matchesPlayed == 0)!;
        expect(coldTeam5.epa).toBeCloseTo(45, 10); // 90/2
    });

    it("records an exact matchesPlayed=0 cold-start snapshot in history", () => {
        let m1 = match([1, 2], [3, 4], [100, 40, 60], [80, 30, 50], 0);
        let m2 = match([5, 6], [7, 8], [130, 60, 70], [90, 35, 55], 1);
        let { history } = computeSeasonEpas([m1, m2]);

        // teams 1-4 are brand new at the very start of the season: cold start is exactly 0.
        for (let team of [1, 2, 3, 4]) {
            let cold = history.find((h) => h.teamNumber == team && h.matchesPlayed == 0);
            expect(cold).toBeDefined();
            expect(cold!.epa).toBeCloseTo(0, 10);
        }
    });

    it("ignores matches that aren't a clean 2v2 (e.g. remote/solo events)", () => {
        let solo: Match = {
            tournamentLevel: TournamentLevel.Quals,
            teams: [
                {
                    matchId: 0,
                    teamNumber: 1,
                    alliance: Alliance.Solo,
                    station: Station.Solo,
                    surrogate: false,
                    dq: false,
                    onField: true,
                },
            ],
            scores: { matchId: 0, alliance: Alliance.Solo, totalPoints: 50, totalPointsNp: 50 },
        };
        let { teamEpas, predictions } = computeSeasonEpas([solo]);
        expect(Object.keys(teamEpas)).toHaveLength(0);
        expect(predictions).toHaveLength(0);
    });

    it("marks predictions ineligible for scoring until the Taylor's Law fit window has passed", () => {
        // 12 alliances per round so every team accumulates >=3 in-window samples
        // (collectFitSamples' minimum) - one round before the window, several inside, one after.
        let matches: Match[] = [
            ...makeRound(5), // before the window - updates EPA but never scoring-eligible
            ...[15, 18, 21, 24, 27].flatMap(makeRound), // inside the window
            ...makeRound(50), // after the window closes - eligible once the fit exists
        ];

        let { predictions, fit } = computeSeasonEpas(matches);

        expect(fit).not.toBeNull();
        expect(fit!.a).toBeGreaterThan(0);

        let beforeWindow = predictions.slice(0, 12);
        expect(beforeWindow.every((p) => !p.eligibleForScoring)).toBe(true);

        let afterWindow = predictions.slice(-12);
        expect(afterWindow.every((p) => p.eligibleForScoring)).toBe(true);
    });

    it("keeps Taylor's Law calibrated by periodically refitting from a trailing window", () => {
        let scaledRound = (dayOffset: number, scaleFactor: number): Match[] =>
            makeRound(dayOffset).map((m) => ({
                ...m,
                scores: {
                    red: { ...m.scores.red, totalPoints: m.scores.red.totalPoints * scaleFactor },
                    blue: {
                        ...m.scores.blue,
                        totalPoints: m.scores.blue.totalPoints * scaleFactor,
                    },
                },
            }));

        // Bootstrap fit comes entirely from unscaled (days 5-50) rounds; a much-later, much-
        // higher-scoring cluster (days 295/298/300, far outside the 30-day rolling window's
        // reach of the bootstrap data) should only show up in a fit that's periodically refreshed.
        let matches: Match[] = [
            ...makeRound(5),
            ...[15, 18, 21, 24, 27].flatMap(makeRound),
            ...makeRound(50),
            ...scaledRound(295, 4),
            ...scaledRound(298, 4),
            ...scaledRound(300, 4),
        ];

        let frozen = computeSeasonEpas(matches, {
            ...DEFAULT_EPA_PARAMS,
            refitEveryDays: Infinity,
        });
        let rolling = computeSeasonEpas(matches, DEFAULT_EPA_PARAMS);

        expect(frozen.fit).not.toBeNull();
        expect(rolling.fit).not.toBeNull();
        // Rolling's final fit reflects the day-295+ cluster the frozen fit never sees at all.
        let ratio = rolling.fit!.a / frozen.fit!.a;
        expect(ratio > 1.5 || ratio < 1 / 1.5).toBe(true);

        // Eligibility is purely time-gated (fitWindowEndDays) and unaffected by whether sigma
        // itself is frozen or periodically refreshed.
        let eligibleCount = (r: typeof frozen) =>
            r.predictions.filter((p) => p.eligibleForScoring).length;
        expect(eligibleCount(rolling)).toBe(eligibleCount(frozen));
    });

    it("leaves the Taylor's Law fit null when a season never has enough distinct teams in the fit window", () => {
        // Only 2 alliances (4 teams) ever play - far fewer than the >=10 needed for a fit.
        let matches: Match[] = [];
        for (let i = 0; i < 5; i++) {
            matches.push(match([1, 2], [3, 4], [100, 40, 60], [80, 30, 50], i * 8));
        }
        let { fit, predictions } = computeSeasonEpas(matches);

        expect(fit).toBeNull();
        expect(predictions.every((p) => !p.eligibleForScoring)).toBe(true);
    });

    it("moves a team's EPA in the direction of its surprise once a variance estimate exists", () => {
        // Match 1 establishes a baseline (total mean ~90). Match 2's red alliance blows their
        // total-score prediction out of the water (200 vs a same-teams-repeat prediction near
        // 0) while blue collapses relative to its own prediction - red's epa should end up
        // higher than blue's.
        let m1 = match([1, 2], [3, 4], [100, 40, 60], [80, 30, 50], 0);
        let m2 = match([1, 2], [3, 4], [200, 100, 100], [10, 5, 5], 1);
        let { teamEpas } = computeSeasonEpas([m1, m2]);

        expect(teamEpas[1].epa).toBeGreaterThan(teamEpas[3].epa);
        expect(teamEpas[1].matchesPlayed).toBe(2);
    });
});

describe("applyMatchIncremental", () => {
    it("agrees exactly with a full replay once the fit is established", () => {
        // Same round shape as the eligibility test above, so a real fit exists by day 50; a
        // further batch of "live" matches should then update state identically whether processed
        // as one full replay or as an incremental resume from a prefix's result. Rolling refit is
        // disabled here (refitEveryDays: Infinity) since it's a full-replay-only feature by
        // design (see calculate-epa.ts's "Incremental live engine" comment) - this test isolates
        // the underlying state-continuation math from that separate feature.
        let params = { ...DEFAULT_EPA_PARAMS, refitEveryDays: Infinity };
        let prefix = [
            ...makeRound(5),
            ...[15, 18, 21, 24, 27].flatMap(makeRound),
            ...makeRound(50), // establishes the fit (window closes at day 45)
        ];
        let liveMatches = [...makeRound(60), ...makeRound(70)];

        let fullReplay = computeSeasonEpas([...prefix, ...liveMatches], params);
        expect(fullReplay.fit).not.toBeNull();

        let prefixResult = computeSeasonEpas(prefix, params);
        expect(prefixResult.fit).not.toBeNull();

        let engine = seedEngineState(prefixResult);
        let incrementalHistory: (typeof fullReplay)["history"] = [];
        for (let m of liveMatches) {
            let result = applyMatchIncremental(engine, m, params);
            expect(result).not.toBeNull();
            incrementalHistory.push(...result!.history);
        }

        for (let team of Object.keys(fullReplay.teamEpas).map(Number)) {
            expect(engine.teamEpas[team].epa).toBeCloseTo(fullReplay.teamEpas[team].epa, 6);
            expect(engine.teamEpas[team].matchesPlayed).toBe(
                fullReplay.teamEpas[team].matchesPlayed
            );
        }

        // Same fit, reused rather than re-derived - the whole point of seeding from a replay.
        expect(engine.fit).toEqual(prefixResult.fit);

        let fullReplayLiveHistory = fullReplay.history.slice(-incrementalHistory.length);
        for (let i = 0; i < incrementalHistory.length; i++) {
            expect(incrementalHistory[i].epa).toBeCloseTo(fullReplayLiveHistory[i].epa, 6);
        }
    });

    it("never rolls its own fit forward - only a fresh full replay refreshes it", () => {
        let prefix = [
            ...makeRound(5),
            ...[15, 18, 21, 24, 27].flatMap(makeRound),
            ...makeRound(50),
        ];
        let prefixResult = computeSeasonEpas(prefix);
        expect(prefixResult.fit).not.toBeNull();

        let engine = seedEngineState(prefixResult);
        // Many rounds, many days apart - a full replay over this same span would trigger several
        // rolling refits (see the computeSeasonEpas test below), but applyMatchIncremental should
        // just keep using whatever fit it was seeded with throughout.
        for (let day of [60, 90, 120, 150]) {
            for (let m of makeRound(day)) applyMatchIncremental(engine, m, DEFAULT_EPA_PARAMS);
        }

        expect(engine.fit).toEqual(prefixResult.fit);
    });

    it("falls back to flat running-SD sigma before its own fit window closes", () => {
        let m1 = match([1, 2], [3, 4], [100, 40, 60], [80, 30, 50], 0);
        let engine = seedEngineState(computeSeasonEpas([]));
        let result = applyMatchIncremental(engine, m1, DEFAULT_EPA_PARAMS);

        expect(engine.fit).toBeNull();
        expect(result).not.toBeNull();
        expect(engine.teamEpas[1].epa).toBeCloseTo(0, 10);
    });
});

describe("scorePredictions", () => {
    let noScoreErr = { predRedScore: 0, predBlueScore: 0, actualRedScore: 0, actualBlueScore: 0 };

    it("computes accuracy/brier/logLoss correctly and excludes ineligible or tied matches", () => {
        let predictions = [
            {
                matchId: 1,
                eventCode: "e",
                predRedWinProb: 0.9,
                actualOutcome: 1,
                eligibleForScoring: true,
                ...noScoreErr,
            },
            {
                matchId: 2,
                eventCode: "e",
                predRedWinProb: 0.9,
                actualOutcome: 0,
                eligibleForScoring: true,
                ...noScoreErr,
            },
            {
                matchId: 3,
                eventCode: "e",
                predRedWinProb: 0.5,
                actualOutcome: 1,
                eligibleForScoring: false,
                ...noScoreErr,
            },
            {
                matchId: 4,
                eventCode: "e",
                predRedWinProb: 0.5,
                actualOutcome: 0.5,
                eligibleForScoring: true,
                ...noScoreErr,
            },
        ];

        let metrics = scorePredictions(predictions);

        expect(metrics.n).toBe(2);
        expect(metrics.accuracy).toBeCloseTo(0.5, 10);
        expect(metrics.brierScore).toBeCloseTo(0.41, 10);
        expect(metrics.logLoss).toBeCloseTo((-Math.log(0.9) - Math.log(0.1)) / 2, 6);
        expect(metrics.scoreMae).toBeCloseTo(0, 10);
        expect(metrics.scoreRmse).toBeCloseTo(0, 10);
    });

    it("computes scoreMae/scoreRmse across both alliances of every eligible match, ties included", () => {
        let predictions = [
            {
                matchId: 1,
                eventCode: "e",
                predRedWinProb: 0.9,
                actualOutcome: 1,
                eligibleForScoring: true,
                predRedScore: 110,
                actualRedScore: 100,
                predBlueScore: 80,
                actualBlueScore: 80,
            },
            {
                matchId: 2,
                eventCode: "e",
                predRedWinProb: 0.5,
                actualOutcome: 0.5,
                eligibleForScoring: true,
                predRedScore: 94,
                actualRedScore: 100,
                predBlueScore: 108,
                actualBlueScore: 100,
            },
            {
                matchId: 3,
                eventCode: "e",
                predRedWinProb: 0.5,
                actualOutcome: 1,
                eligibleForScoring: false,
                predRedScore: 1000,
                actualRedScore: 0,
                predBlueScore: 1000,
                actualBlueScore: 0,
            },
        ];

        let metrics = scorePredictions(predictions);

        // errors: 10, 0, 6, 8 -> mae = 24/4 = 6, rmse = sqrt((100+0+36+64)/4) = sqrt(50)
        expect(metrics.scoreMae).toBeCloseTo(6, 10);
        expect(metrics.scoreRmse).toBeCloseTo(Math.sqrt(50), 10);
    });

    it("returns zeroed metrics when nothing is eligible", () => {
        let metrics = scorePredictions([
            {
                matchId: 1,
                eventCode: "e",
                predRedWinProb: 0.5,
                actualOutcome: 1,
                eligibleForScoring: false,
                ...noScoreErr,
            },
        ]);
        expect(metrics).toEqual({
            n: 0,
            accuracy: 0,
            brierScore: 0,
            logLoss: 0,
            scoreMae: 0,
            scoreRmse: 0,
        });
    });
});

describe("DEFAULT_EPA_PARAMS", () => {
    it("matches Statcube's documented k-factor values, plus the tuned signal weights/fit window", () => {
        let params: EpaParams = DEFAULT_EPA_PARAMS;
        expect(params.kMaxFraction).toBeCloseTo(0.4, 10);
        expect(params.kMinFraction).toBeCloseTo(0.2, 10);
        expect(params.warmupMatches).toBe(6);
        expect(params.stableMatches).toBe(12);
        expect(params.fitWindowStartDays).toBe(14);
        // Widened from Statcube's documented 30 days - see backtest-epa-sweep*.js.
        expect(params.fitWindowEndDays).toBe(45);
        // Backtested improvement over freezing the bootstrap fit - see backtest-epa-rolling-sigma.js.
        expect(params.rollingWindowDays).toBe(30);
        expect(params.refitEveryDays).toBe(1);
        // Tuned off Statcube's documented 1/1 weighting - see calculate-epa.ts's file header.
        expect(params.marginWeight).toBeCloseTo(0.25, 10);
        expect(params.pointsWeight).toBeCloseTo(1.5, 10);
    });
});
