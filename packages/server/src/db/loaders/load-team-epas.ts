import {
    applyMatchIncremental,
    DEFAULT_EPA_PARAMS,
    EpaEngineState,
    FrontendMatch,
    Season,
    computeSeasonEpas,
    seedEngineState,
    stdDev,
    TeamEpaSnapshot,
} from "@ftc-scout/common";
import { DATA_SOURCE } from "../data-source";
import { Match } from "../entities/Match";
import { TeamEpa } from "../entities/TeamEpa";
import { TeamEpaHistory } from "../entities/TeamEpaHistory";
import { DataHasBeenLoaded } from "../entities/DataHasBeenLoaded";
import { EpaLiveState } from "../entities/EpaLiveState";
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

    for (let m of newMatches) {
        let result = applyMatchIncremental(engineState, m.toFrontend(), DEFAULT_EPA_PARAMS);
        if (!result) continue;
        for (let h of result.history) {
            touchedTeams.add(h.teamNumber);
            historySnapshots.push(h);
        }
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
