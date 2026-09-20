import {
    Alliance,
    applyMatchIncremental,
    DEFAULT_EPA_PARAMS,
    EpaEngineState,
    FrontendMatch,
    MatchPrediction,
    predictMatch,
    Season,
    SeasonEpaResult,
    addObservation,
    computeSeasonEpas,
    emptyRunningStat,
    seedEngineState,
    stdDev,
    TeamEpaSnapshot,
    winProbability,
} from "@ftc-scout/common";
import { Matrix, SingularValueDecomposition } from "ml-matrix";
import { DATA_SOURCE } from "../data-source";
import { Match } from "../entities/Match";
import { TeamEpa } from "../entities/TeamEpa";
import { TeamOpr } from "../entities/TeamOpr";
import { TeamEpaHistory } from "../entities/TeamEpaHistory";
import { DataHasBeenLoaded } from "../entities/DataHasBeenLoaded";
import { EpaLiveState } from "../entities/EpaLiveState";
import { PredictionLevel, PredictionSource, PredictionStat } from "../entities/PredictionStat";
import { MatchScore } from "../entities/dyn/match-score";
import { TeamMatchParticipation } from "../entities/TeamMatchParticipation";

function matchTimeOf(m: Match): Date | null {
    return m.actualStartTime ?? m.scheduledStartTime ?? m.postResultTime;
}

// Postgres' wire protocol caps a single query at 65535 bound parameters - upsert() (unlike
// save(..., {chunk})) doesn't chunk large arrays itself, so a season with enough teams (8 params
// each) can overflow that limit in one shot. Chunking here keeps every upsert well under it.
async function upsertChunked<T extends object>(
    repo: { upsert: (entities: T[], conflictPaths: string[]) => Promise<unknown> },
    entities: T[],
    conflictPaths: string[],
    chunkSize: number
) {
    for (let i = 0; i < entities.length; i += chunkSize) {
        await repo.upsert(entities.slice(i, i + chunkSize), conflictPaths);
    }
}

// A prediction plus its real outcome - the subset of MatchPrediction needed for stat-bucketing,
// shared between quals (from computeSeasonEpas) and the hand-built playoff predictions below.
interface ScoredOutcome {
    eventCode: string;
    matchId: number;
    predRedWinProb: number;
    actualOutcome: number;
    predRedScore: number;
    predBlueScore: number;
    actualRedScore: number;
    actualBlueScore: number;
}

interface DayBucket {
    eligible: number;
    classifiable: number;
    correct: number;
    brierSum: number;
    logLossSum: number;
    absErrSum: number;
    sqErrSum: number;
}
function emptyDayBucket(): DayBucket {
    return {
        eligible: 0,
        classifiable: 0,
        correct: 0,
        brierSum: 0,
        logLossSum: 0,
        absErrSum: 0,
        sqErrSum: 0,
    };
}

// Mirrors calculate-epa.ts's scorePredictions() math exactly, just accumulated per day instead
// of over the whole season. Ties count toward eligible (score-error metrics grade the predicted
// margin) but not classifiable/correct (no winner to call right).
function bucketPredictions(
    predictions: ScoredOutcome[],
    matchTimeByKey: Map<string, Date | null>
): Map<string, DayBucket> {
    let byDay = new Map<string, DayBucket>();
    let eps = 1e-9;
    for (let p of predictions) {
        let time = matchTimeByKey.get(`${p.eventCode}:${p.matchId}`);
        if (!time) continue;
        let day = time.toISOString().slice(0, 10);
        let b = byDay.get(day) ?? emptyDayBucket();

        b.eligible += 1;
        let redErr = p.predRedScore - p.actualRedScore;
        let blueErr = p.predBlueScore - p.actualBlueScore;
        b.absErrSum += Math.abs(redErr) + Math.abs(blueErr);
        b.sqErrSum += redErr * redErr + blueErr * blueErr;

        if (p.actualOutcome !== 0.5) {
            b.classifiable += 1;
            let predictedWinner = p.predRedWinProb >= 0.5 ? 1 : 0;
            if (predictedWinner === p.actualOutcome) b.correct += 1;
            b.brierSum += (p.predRedWinProb - p.actualOutcome) ** 2;
            let clamped = Math.min(1 - eps, Math.max(eps, p.predRedWinProb));
            b.logLossSum -=
                p.actualOutcome * Math.log(clamped) + (1 - p.actualOutcome) * Math.log(1 - clamped);
        }

        byDay.set(day, b);
    }
    return byDay;
}

function toStatRow(
    season: Season,
    level: PredictionLevel,
    source: PredictionSource,
    date: string,
    b: DayBucket
): PredictionStat {
    return PredictionStat.create({
        season,
        date,
        level,
        source,
        eligibleCount: b.eligible,
        classifiableCount: b.classifiable,
        correctCount: b.correct,
        brierSum: b.brierSum,
        logLossSum: b.logLossSum,
        absErrSum: b.absErrSum,
        sqErrSum: b.sqErrSum,
    });
}

// Full replay of a season always re-derives the same day buckets from scratch, so this
// overwrites rather than adds - the counterpart to addDailyStats' add-in-place version below.
async function saveDailyStatsFullRebuild(
    season: Season,
    level: PredictionLevel,
    source: PredictionSource,
    predictions: ScoredOutcome[],
    matchTimeByKey: Map<string, Date | null>
) {
    let byDay = bucketPredictions(predictions, matchTimeByKey);
    let rows = [...byDay.entries()].map(([date, b]) => toStatRow(season, level, source, date, b));
    await upsertChunked(
        DATA_SOURCE.getRepository(PredictionStat),
        rows,
        ["season", "date", "level", "source"],
        500
    );
}

// Only sees the new matches since the last watermark, so it adds to whatever a day's bucket
// already has instead of overwriting it (a full replay reconciles the running total later).
async function addDailyStats(
    season: Season,
    level: PredictionLevel,
    source: PredictionSource,
    predictions: ScoredOutcome[],
    matchTimeByKey: Map<string, Date | null>
) {
    let byDay = bucketPredictions(predictions, matchTimeByKey);
    for (let [date, b] of byDay) {
        await DATA_SOURCE.query(
            `INSERT INTO prediction_stat
                (season, date, level, source, eligible_count, classifiable_count, correct_count, brier_sum, log_loss_sum, abs_err_sum, sq_err_sum)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (season, date, level, source) DO UPDATE SET
                 eligible_count = prediction_stat.eligible_count + excluded.eligible_count,
                 classifiable_count = prediction_stat.classifiable_count + excluded.classifiable_count,
                 correct_count = prediction_stat.correct_count + excluded.correct_count,
                 brier_sum = prediction_stat.brier_sum + excluded.brier_sum,
                 log_loss_sum = prediction_stat.log_loss_sum + excluded.log_loss_sum,
                 abs_err_sum = prediction_stat.abs_err_sum + excluded.abs_err_sum,
                 sq_err_sum = prediction_stat.sq_err_sum + excluded.sq_err_sum`,
            [
                season,
                date,
                level,
                source,
                b.eligible,
                b.classifiable,
                b.correct,
                b.brierSum,
                b.logLossSum,
                b.absErrSum,
                b.sqErrSum,
            ]
        );
    }
}

// EPA never updates from playoff/semis/finals matches (see computeMatchOrder's quals-only design
// throughout this file), but that doesn't mean they can't be scored: each team already has an
// EPA from its quals play, so a match can still get a prediction - it just can't feed back into
// that EPA. Approximates the point-in-time fit with the season's final one (a full replay only
// keeps that), which is a minor look-ahead for early-season playoffs but immaterial for stats
// purposes - this never touches what's served live (Match.ts's resolver uses the true live fit).
// No fit yet (an early-season event's own playoffs, before the season-wide fit exists) isn't
// treated as "unscoreable" - predictMatch degrades to a neutral 50/50 guess, same as every other
// data-starved prediction here, rather than silently skipping it.
async function computePlayoffPredictions(
    season: Season,
    qualsResult: SeasonEpaResult,
    qualsMatchTimeByKey: Map<string, Date | null>
): Promise<{ predictions: ScoredOutcome[]; matchTimeByKey: Map<string, Date | null> }> {
    let matches = await DATA_SOURCE.getRepository(Match)
        .createQueryBuilder("m")
        .where("m.event_season = :season", { season })
        .andWhere("m.has_been_played")
        .andWhere("m.tournament_level != 'Quals'")
        .getMany();

    for (let m of matches) {
        m.scores = [];
        m.teams = [];
    }
    let matchMap = new Map(matches.map((m) => [`${m.eventCode}:${m.id}`, m]));
    let matchKeys = matches.map((m) => ({ season, eventCode: m.eventCode, matchId: m.id }));

    let Ms = MatchScore[season];
    if (Ms) {
        let scores = await Ms.find({ where: matchKeys });
        for (let s of scores) matchMap.get(`${s.eventCode}:${s.matchId}`)?.scores.push(s);
    }
    let teams = await TeamMatchParticipation.find({ where: matchKeys });
    for (let t of teams) matchMap.get(`${t.eventCode}:${t.matchId}`)?.teams.push(t);

    let matchTimeByKey = new Map(matches.map((m) => [`${m.eventCode}:${m.id}`, matchTimeOf(m)]));

    // Sorted per-team EPA-over-time, built from the quals replay's history, so each playoff
    // match can be scored against "what EPA said about this team as of just before this match".
    let historyByTeam = new Map<number, { timeMs: number; epa: number }[]>();
    for (let h of qualsResult.history) {
        let time = qualsMatchTimeByKey.get(`${h.eventCode}:${h.matchId}`);
        if (!time) continue;
        let arr = historyByTeam.get(h.teamNumber);
        if (!arr) {
            arr = [];
            historyByTeam.set(h.teamNumber, arr);
        }
        arr.push({ timeMs: time.getTime(), epa: h.epa });
    }
    for (let arr of historyByTeam.values()) arr.sort((a, b) => a.timeMs - b.timeMs);

    let predictions: ScoredOutcome[] = [];
    let coldStart = qualsResult.totalStat.count > 0 ? qualsResult.totalStat.mean / 2 : 0;

    function latestEpaBefore(teamNumber: number, beforeMs: number): number {
        let hist = historyByTeam.get(teamNumber);
        if (!hist || hist.length === 0) return coldStart;
        let lo = 0,
            hi = hist.length - 1,
            found = -1;
        while (lo <= hi) {
            let mid = (lo + hi) >> 1;
            if (hist[mid].timeMs < beforeMs) {
                found = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return found === -1 ? coldStart : hist[found].epa;
    }

    for (let m of matches) {
        let match = matchMap.get(`${m.eventCode}:${m.id}`)!;
        let redScore = match.scores.find((s) => s.alliance === Alliance.Red);
        let blueScore = match.scores.find((s) => s.alliance === Alliance.Blue);
        if (!redScore || !blueScore) continue;

        let redTeams = match.teams.filter((t) => t.alliance === Alliance.Red && !t.surrogate);
        let blueTeams = match.teams.filter((t) => t.alliance === Alliance.Blue && !t.surrogate);
        if (redTeams.length !== 2 || blueTeams.length !== 2) continue;

        let time = matchTimeByKey.get(`${m.eventCode}:${m.id}`);
        if (!time) continue;
        let timeMs = time.getTime();

        let r1 = latestEpaBefore(redTeams[0].teamNumber, timeMs);
        let r2 = latestEpaBefore(redTeams[1].teamNumber, timeMs);
        let b1 = latestEpaBefore(blueTeams[0].teamNumber, timeMs);
        let b2 = latestEpaBefore(blueTeams[1].teamNumber, timeMs);

        let pred = predictMatch(
            [{ epa: r1 }, { epa: r2 }],
            [{ epa: b1 }, { epa: b2 }],
            qualsResult.fit
        );

        let redPts = redScore.totalPoints;
        let bluePts = blueScore.totalPoints;

        predictions.push({
            eventCode: m.eventCode,
            matchId: m.id,
            predRedWinProb: pred.redWinProb,
            actualOutcome: redPts > bluePts ? 1 : redPts < bluePts ? 0 : 0.5,
            predRedScore: pred.redScore,
            predBlueScore: pred.blueScore,
            actualRedScore: redPts,
            actualBlueScore: bluePts,
        });
    }

    return { predictions, matchTimeByKey };
}

// Simplest possible baseline: whichever alliance's teams have won more of their matches so far
// (ties splitting half a win, half a loss) is favored, in proportion to how much better their
// combined record is - no margin model, no regression, just the record. Playoff matches get
// predicted from the record as it stood after quals too (same as EPA/OPR below), they just never
// update that record - a team's playoff wins don't change their "win/loss ratio" baseline.
const MIN_TEAM_MATCHES_FOR_WIN_LOSS = 3;
function computeWinLossPredictions(matches: Match[]): {
    quals: ScoredOutcome[];
    playoff: ScoredOutcome[];
} {
    let record = new Map<number, { wins: number; losses: number }>();
    let quals: ScoredOutcome[] = [];
    let playoff: ScoredOutcome[] = [];

    let ensure = (t: number) => {
        let r = record.get(t);
        if (!r) {
            r = { wins: 0, losses: 0 };
            record.set(t, r);
        }
        return r;
    };
    let winRate = (t: number) => {
        let r = ensure(t);
        let games = r.wins + r.losses;
        return games > 0 ? r.wins / games : 0.5;
    };

    for (let m of matches) {
        let redScore = m.scores.find((s) => s.alliance === Alliance.Red);
        let blueScore = m.scores.find((s) => s.alliance === Alliance.Blue);
        if (!redScore || !blueScore) continue;

        let redTeams = m.teams.filter((t) => t.alliance === Alliance.Red && !t.surrogate);
        let blueTeams = m.teams.filter((t) => t.alliance === Alliance.Blue && !t.surrogate);
        if (redTeams.length !== 2 || blueTeams.length !== 2) continue;

        let isQuals = m.tournamentLevel === "Quals";
        let allTeamNums = [...redTeams, ...blueTeams].map((t) => t.teamNumber);
        let enoughData = allTeamNums.every((t) => {
            let r = ensure(t);
            return r.wins + r.losses >= MIN_TEAM_MATCHES_FOR_WIN_LOSS;
        });

        let redPts = redScore.totalPoints;
        let bluePts = blueScore.totalPoints;
        let actualOutcome = redPts > bluePts ? 1 : redPts < bluePts ? 0 : 0.5;

        if (enoughData) {
            let redRate = (winRate(redTeams[0].teamNumber) + winRate(redTeams[1].teamNumber)) / 2;
            let blueRate =
                (winRate(blueTeams[0].teamNumber) + winRate(blueTeams[1].teamNumber)) / 2;
            let total = redRate + blueRate;

            (isQuals ? quals : playoff).push({
                eventCode: m.eventCode,
                matchId: m.id,
                predRedWinProb: total > 0 ? redRate / total : 0.5,
                actualOutcome,
                // No score model - MAE/RMSE aren't meaningful for a win/loss-only predictor.
                predRedScore: 0,
                predBlueScore: 0,
                actualRedScore: 0,
                actualBlueScore: 0,
            });
        }

        if (!isQuals) continue; // playoff results never touch the record itself

        let redWon = actualOutcome === 1;
        let blueWon = actualOutcome === 0;
        for (let t of allTeamNums) {
            let r = ensure(t);
            let onRed = redTeams.some((rt) => rt.teamNumber === t);
            let won = onRed ? redWon : blueWon;
            let lost = onRed ? blueWon : redWon;
            if (won) r.wins += 1;
            else if (lost) r.losses += 1;
            else {
                r.wins += 0.5;
                r.losses += 0.5;
            }
        }
    }

    return { quals, playoff };
}

function calculateOpr(
    scores: { team1: number; team2: number; result: number }[]
): Map<number, number> {
    let ret = new Map<number, number>();
    if (scores.length === 0) return ret;
    let allTeams = [...new Set(scores.flatMap((s) => [s.team1, s.team2]))];
    let allianceMatrix = new Matrix(
        scores.map((s) => allTeams.map((t) => (t === s.team1 || t === s.team2 ? 1 : 0)))
    );
    let resultsVector = Matrix.columnVector(scores.map((s) => s.result));
    let oprs = new SingularValueDecomposition(allianceMatrix, { autoTranspose: true }).solve(
        resultsVector
    );
    for (let i = 0; i < allTeams.length; i++) ret.set(allTeams[i], oprs.get(i, 0));
    return ret;
}

const MIN_SAMPLES_FOR_OPR_SCORING = 15;

// OPR is a whole-event batch regression (see calculate-opr.ts), not a "before this match"
// predictor the way EPA is - the only leakage-free way to use it predictively is a team's OPR
// from their most recently *completed* event, carried forward until a newer completed event
// replaces it. Uses one season-wide SD for sigma (unlike EPA's per-team Taylor's Law fit), since
// OPR has no per-team variance model of its own. Playoffs are predicted with the OPR this same
// event's own quals just produced (step 2 runs before step 3), but never feed back into it or
// into the season-wide SD - same "predict, don't update" treatment as EPA's playoff handling.
function computeOprPredictions(matches: Match[]): {
    quals: ScoredOutcome[];
    playoff: ScoredOutcome[];
    finalOpr: Map<number, number>;
    matchesPlayed: Map<number, number>;
} {
    let eventOrder: string[] = [];
    let eventQuals = new Map<string, Match[]>();
    let eventPlayoffs = new Map<string, Match[]>();
    for (let m of matches) {
        let redScore = m.scores.find((s) => s.alliance === Alliance.Red);
        let blueScore = m.scores.find((s) => s.alliance === Alliance.Blue);
        let redTeams = m.teams.filter((t) => t.alliance === Alliance.Red && !t.surrogate);
        let blueTeams = m.teams.filter((t) => t.alliance === Alliance.Blue && !t.surrogate);
        if (!redScore || !blueScore || redTeams.length !== 2 || blueTeams.length !== 2) continue;

        if (!eventQuals.has(m.eventCode)) {
            eventQuals.set(m.eventCode, []);
            eventPlayoffs.set(m.eventCode, []);
            eventOrder.push(m.eventCode);
        }
        (m.tournamentLevel === "Quals" ? eventQuals : eventPlayoffs).get(m.eventCode)!.push(m);
    }

    let lastKnownOpr = new Map<number, number>();
    let matchesPlayed = new Map<number, number>();
    let totalStat = emptyRunningStat();
    let quals: ScoredOutcome[] = [];
    let playoff: ScoredOutcome[] = [];

    function predictOne(m: Match, target: ScoredOutcome[]) {
        let redTeams = m.teams.filter((t) => t.alliance === Alliance.Red && !t.surrogate);
        let blueTeams = m.teams.filter((t) => t.alliance === Alliance.Blue && !t.surrogate);
        let get = (t: number) =>
            lastKnownOpr.get(t) ?? (totalStat.count > 0 ? totalStat.mean / 2 : 0);

        let predRed = get(redTeams[0].teamNumber) + get(redTeams[1].teamNumber);
        let predBlue = get(blueTeams[0].teamNumber) + get(blueTeams[1].teamNumber);
        let predRedWinProb = winProbability(predRed, predBlue, stdDev(totalStat));

        let redScore = m.scores.find((s) => s.alliance === Alliance.Red)!;
        let blueScore = m.scores.find((s) => s.alliance === Alliance.Blue)!;
        let redPts = redScore.totalPoints;
        let bluePts = blueScore.totalPoints;

        if (totalStat.count >= MIN_SAMPLES_FOR_OPR_SCORING) {
            target.push({
                eventCode: m.eventCode,
                matchId: m.id,
                predRedWinProb,
                actualOutcome: redPts > bluePts ? 1 : redPts < bluePts ? 0 : 0.5,
                predRedScore: predRed,
                predBlueScore: predBlue,
                actualRedScore: redPts,
                actualBlueScore: bluePts,
            });
        }

        return { redPts, bluePts };
    }

    for (let eventCode of eventOrder) {
        let qualsMs = eventQuals.get(eventCode)!;
        let playoffMs = eventPlayoffs.get(eventCode)!;

        // 1) Predict this event's quals matches using OPR carried forward from PRIOR events only.
        for (let m of qualsMs) {
            let { redPts, bluePts } = predictOne(m, quals);
            totalStat = addObservation(addObservation(totalStat, redPts), bluePts);

            let redTeams = m.teams.filter((t) => t.alliance === Alliance.Red && !t.surrogate);
            let blueTeams = m.teams.filter((t) => t.alliance === Alliance.Blue && !t.surrogate);
            for (let t of [...redTeams, ...blueTeams]) {
                matchesPlayed.set(t.teamNumber, (matchesPlayed.get(t.teamNumber) ?? 0) + 1);
            }
        }

        // 2) Now compute THIS event's own OPR and update the carry-forward map.
        let dataTotal: { team1: number; team2: number; result: number }[] = [];
        for (let m of qualsMs) {
            for (let allianceLabel of [Alliance.Red, Alliance.Blue]) {
                let allianceTeams = m.teams.filter(
                    (t) => t.alliance === allianceLabel && !t.surrogate
                );
                let [team1, team2] = allianceTeams.map((t) => t.teamNumber);
                let s = m.scores.find((sc) => sc.alliance === allianceLabel)!;
                dataTotal.push({ team1, team2, result: s.totalPoints });
            }
        }
        for (let [team, opr] of calculateOpr(dataTotal)) lastKnownOpr.set(team, opr);

        // 3) Predict this event's playoff matches with the OPR just computed above - read-only,
        //    doesn't touch lastKnownOpr or totalStat.
        for (let m of playoffMs) predictOne(m, playoff);
    }

    return { quals, playoff, finalOpr: lastKnownOpr, matchesPlayed };
}

function toTeamEpaRow(season: Season, teamNumber: number, engineState: EpaEngineState): TeamEpa {
    let state = engineState.teamEpas[teamNumber];
    return TeamEpa.create({
        season,
        teamNumber,
        epa: state.epa,
        matchesPlayed: state.matchesPlayed,
        seasonMean: engineState.totalStat.mean,
        seasonSd: stdDev(engineState.totalStat),
        fitA: engineState.fit?.a ?? null,
        fitB: engineState.fit?.b ?? null,
    });
}

function toTeamOprRow(
    season: Season,
    teamNumber: number,
    opr: number,
    matchesPlayed: number
): TeamOpr {
    return TeamOpr.create({ season, teamNumber, opr, matchesPlayed });
}

function toHistoryRow(
    season: Season,
    h: TeamEpaSnapshot,
    matchTimeByKey: Map<string, Date | null>
): TeamEpaHistory {
    return TeamEpaHistory.create({
        season,
        eventCode: h.eventCode,
        matchId: h.matchId,
        teamNumber: h.teamNumber,
        epa: h.epa,
        matchesPlayed: h.matchesPlayed,
        matchTime: matchTimeByKey.get(`${h.eventCode}:${h.matchId}`) ?? null,
    });
}

export async function computeAndSaveEpas(season: Season) {
    let matches = await DATA_SOURCE.getRepository(Match)
        .createQueryBuilder("m")
        .where("m.event_season = :season", { season })
        .andWhere("m.has_been_played")
        .orderBy(
            "COALESCE(m.actual_start_time, m.scheduled_start_time, m.post_result_time)",
            "ASC",
            "NULLS LAST"
        )
        .addOrderBy("m.id", "ASC")
        .getMany();

    for (let m of matches) {
        m.scores = [];
        m.teams = [];
    }
    let matchMap = new Map(matches.map((m) => [`${m.eventCode}:${m.id}`, m]));

    let Ms = MatchScore[season];
    if (Ms) {
        let scores = await Ms.find({ where: { season } });
        for (let s of scores) matchMap.get(`${s.eventCode}:${s.matchId}`)?.scores.push(s);
    }
    let teams = await TeamMatchParticipation.find({ where: { season } });
    for (let t of teams) matchMap.get(`${t.eventCode}:${t.matchId}`)?.teams.push(t);

    let frontendMatches: FrontendMatch[] = matches.map((m) => m.toFrontend());
    let matchTimeByKey = new Map(matches.map((m) => [`${m.eventCode}:${m.id}`, matchTimeOf(m)]));

    let result = computeSeasonEpas(frontendMatches, DEFAULT_EPA_PARAMS);
    let engineState = seedEngineState(result);

    let rows = Object.keys(result.teamEpas).map((teamNumber) =>
        toTeamEpaRow(season, +teamNumber, engineState)
    );
    const HISTORY_CHUNK_SIZE = 2000;

    await upsertChunked(
        DATA_SOURCE.getRepository(TeamEpa),
        rows,
        ["season", "teamNumber"],
        HISTORY_CHUNK_SIZE
    );

    for (let i = 0; i < result.history.length; i += HISTORY_CHUNK_SIZE) {
        let chunk = result.history
            .slice(i, i + HISTORY_CHUNK_SIZE)
            .map((h) => toHistoryRow(season, h, matchTimeByKey));
        await DATA_SOURCE.getRepository(TeamEpaHistory).upsert(chunk, [
            "season",
            "teamNumber",
            "matchesPlayed",
        ]);
        await new Promise((resolve) => setImmediate(resolve));
    }

    // Not filtered by eligibleForScoring - that gate exists for backtesting the algorithm itself
    // fairly (see calculate-epa.ts's scorePredictions), but excluding EPA's own bootstrap period
    // here while OPR/win-loss below get no equivalent pass would make this comparison dishonest.
    // Every prediction actually made counts, bootstrap included - it just naturally scores lower
    // early on, same as the other two.
    await saveDailyStatsFullRebuild(
        season,
        PredictionLevel.Quals,
        PredictionSource.Epa,
        result.predictions,
        matchTimeByKey
    );

    let playoffs = await computePlayoffPredictions(season, result, matchTimeByKey);
    await saveDailyStatsFullRebuild(
        season,
        PredictionLevel.Playoff,
        PredictionSource.Epa,
        playoffs.predictions,
        playoffs.matchTimeByKey
    );

    // OPR and win/loss-record baselines, for comparison against EPA on the same matches. Only
    // refreshed by this full replay, not the 1-minute incremental path - a day's lag on these
    // secondary baselines is an easy trade.
    let oprPredictions = computeOprPredictions(matches);
    await saveDailyStatsFullRebuild(
        season,
        PredictionLevel.Quals,
        PredictionSource.Opr,
        oprPredictions.quals,
        matchTimeByKey
    );
    await saveDailyStatsFullRebuild(
        season,
        PredictionLevel.Playoff,
        PredictionSource.Opr,
        oprPredictions.playoff,
        matchTimeByKey
    );

    // Persisted for the Rankings tab (records page) - each team's OPR as of their most recently
    // completed event this season, same carry-forward value the backtest above already computes.
    let oprRows = [...oprPredictions.finalOpr.entries()].map(([teamNumber, opr]) =>
        toTeamOprRow(season, teamNumber, opr, oprPredictions.matchesPlayed.get(teamNumber) ?? 0)
    );
    await upsertChunked(
        DATA_SOURCE.getRepository(TeamOpr),
        oprRows,
        ["season", "teamNumber"],
        HISTORY_CHUNK_SIZE
    );

    let winLossPredictions = computeWinLossPredictions(matches);
    await saveDailyStatsFullRebuild(
        season,
        PredictionLevel.Quals,
        PredictionSource.WinLoss,
        winLossPredictions.quals,
        matchTimeByKey
    );
    await saveDailyStatsFullRebuild(
        season,
        PredictionLevel.Playoff,
        PredictionSource.WinLoss,
        winLossPredictions.playoff,
        matchTimeByKey
    );

    await DATA_SOURCE.getRepository(EpaLiveState).save(
        EpaLiveState.create({
            season,
            engineState: engineState as unknown as Record<string, unknown>,
            lastMatchTime: result.lastMatch?.time != null ? new Date(result.lastMatch.time) : null,
            lastMatchId: result.lastMatch?.matchId ?? null,
            lastEventCode: result.lastMatch?.eventCode ?? null,
        })
    );
    await DataHasBeenLoaded.create({ season, epas: true }).save();

    console.info(
        `Computed EPA for ${rows.length} teams (${result.history.length} match snapshots) in season ${season}.`
    );
}

// Much simpler code to run when new matches loaded, does need recompute once in a while for unchronilogical loaded data
export async function incrementallyUpdateEpas(season: Season) {
    let liveState = await EpaLiveState.findOneBy({ season });
    if (!liveState) return; // No full replay has ever run for this season yet - nothing to resume from.

    let engineState = liveState.engineState as unknown as EpaEngineState;

    let qb = DATA_SOURCE.getRepository(Match)
        .createQueryBuilder("m")
        .where("m.event_season = :season", { season })
        .andWhere("m.has_been_played")
        .andWhere("m.tournament_level = 'Quals'");

    // Find new matches (with null handling)
    qb.andWhere(
        `(COALESCE(m.actual_start_time, m.scheduled_start_time, m.post_result_time, 'infinity'::timestamptz)
            > COALESCE(:lastMatchTime::timestamptz, 'infinity'::timestamptz)
          OR (COALESCE(m.actual_start_time, m.scheduled_start_time, m.post_result_time, 'infinity'::timestamptz)
                = COALESCE(:lastMatchTime::timestamptz, 'infinity'::timestamptz)
              AND m.id > :lastMatchId))`,
        { lastMatchTime: liveState.lastMatchTime, lastMatchId: liveState.lastMatchId ?? 0 }
    );

    let newMatches = await qb
        .orderBy(
            "COALESCE(m.actual_start_time, m.scheduled_start_time, m.post_result_time)",
            "ASC",
            "NULLS LAST"
        )
        .addOrderBy("m.id", "ASC")
        .getMany();

    if (newMatches.length === 0) return;

    for (let m of newMatches) {
        m.scores = [];
        m.teams = [];
    }
    let newMatchMap = new Map(newMatches.map((m) => [`${m.eventCode}:${m.id}`, m]));
    let matchKeys = newMatches.map((m) => ({ season, eventCode: m.eventCode, matchId: m.id }));

    let Ms = MatchScore[season];
    if (Ms) {
        let scores = await Ms.find({ where: matchKeys });
        for (let s of scores) newMatchMap.get(`${s.eventCode}:${s.matchId}`)?.scores.push(s);
    }
    let teams = await TeamMatchParticipation.find({ where: matchKeys });
    for (let t of teams) newMatchMap.get(`${t.eventCode}:${t.matchId}`)?.teams.push(t);

    let matchTimeByKey = new Map(newMatches.map((m) => [`${m.eventCode}:${m.id}`, matchTimeOf(m)]));
    let touchedTeams = new Set<number>();
    let historySnapshots: TeamEpaSnapshot[] = [];
    let predictions: MatchPrediction[] = [];

    for (let m of newMatches) {
        let result = applyMatchIncremental(engineState, m.toFrontend(), DEFAULT_EPA_PARAMS);
        if (!result) continue;
        for (let h of result.history) {
            touchedTeams.add(h.teamNumber);
            historySnapshots.push(h);
        }
        predictions.push(result.prediction);
    }

    let teamRows = [...touchedTeams].map((teamNumber) =>
        toTeamEpaRow(season, teamNumber, engineState)
    );
    let last = newMatches[newMatches.length - 1];
    const HISTORY_CHUNK_SIZE = 2000;

    // Not wrapped in a transaction - see computeAndSaveEpas' comment on the same choice.
    await upsertChunked(
        DATA_SOURCE.getRepository(TeamEpa),
        teamRows,
        ["season", "teamNumber"],
        HISTORY_CHUNK_SIZE
    );

    for (let i = 0; i < historySnapshots.length; i += HISTORY_CHUNK_SIZE) {
        let chunk = historySnapshots
            .slice(i, i + HISTORY_CHUNK_SIZE)
            .map((h) => toHistoryRow(season, h, matchTimeByKey));
        await DATA_SOURCE.getRepository(TeamEpaHistory).upsert(chunk, [
            "season",
            "teamNumber",
            "matchesPlayed",
        ]);
        await new Promise((resolve) => setImmediate(resolve));
    }

    // Not filtered by eligibleForScoring - see computeAndSaveEpas' comment on the same choice.
    await addDailyStats(
        season,
        PredictionLevel.Quals,
        PredictionSource.Epa,
        predictions,
        matchTimeByKey
    );

    await DATA_SOURCE.getRepository(EpaLiveState).save(
        EpaLiveState.create({
            season,
            engineState: engineState as unknown as Record<string, unknown>,
            lastMatchTime: matchTimeOf(last),
            lastMatchId: last.id,
            lastEventCode: last.eventCode,
        })
    );

    console.info(
        `Incrementally updated EPA for ${teamRows.length} teams (${newMatches.length} new matches)`
    );
}
