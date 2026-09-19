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

function matchTimeOf(m: Match): Date | null {
    return m.actualStartTime ?? m.scheduledStartTime ?? m.postResultTime;
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

// Full deterministic replay, same idea as calculateTeamEventStats's per-event recompute
// (see load-all-matches.ts) but widened to a whole season: every call walks *all* of a
// season's played qualification matches in chronological order and recomputes every team's
// EPA from the cold-start default. Cheap (pure arithmetic, no SVD) and self-correcting if
// events happen to load out of true chronological order between sync cycles, or if a match's
// score gets corrected retroactively.
//
// Besides TeamEpa/TeamEpaHistory, this also (re)seeds EpaLiveState from the replay's own result
// - the hand-off point incrementallyUpdateEpas resumes from between full replays (see watch.ts:
// this runs once at startup and again after every "Full" match load, which is also exactly the
// job that picks up late-published/corrected older events; incrementallyUpdateEpas fills the
// gap in between on a 1-minute cycle without redoing the whole season each time).
export async function computeAndSaveEpas(season: Season) {
    let matches = await DATA_SOURCE.getRepository(Match)
        .createQueryBuilder("m")
        .where("m.event_season = :season", { season })
        .andWhere("m.has_been_played")
        .leftJoinAndMapMany(
            "m.scores",
            `match_score_${season}`,
            "ms",
            "m.event_season = ms.season AND m.event_code = ms.event_code AND m.id = ms.match_id"
        )
        .leftJoinAndMapMany(
            "m.teams",
            "team_match_participation",
            "tmp",
            "m.event_season = tmp.season AND m.event_code = tmp.event_code AND m.id = tmp.match_id"
        )
        .orderBy(
            "COALESCE(m.actual_start_time, m.scheduled_start_time, m.post_result_time)",
            "ASC",
            "NULLS LAST"
        )
        .addOrderBy("m.id", "ASC")
        .getMany();

    let frontendMatches: FrontendMatch[] = matches.map((m) => m.toFrontend());
    let matchTimeByKey = new Map(matches.map((m) => [`${m.eventCode}:${m.id}`, matchTimeOf(m)]));

    let result = computeSeasonEpas(frontendMatches, DEFAULT_EPA_PARAMS);
    let engineState = seedEngineState(result);

    let rows = Object.keys(result.teamEpas).map((teamNumber) =>
        toTeamEpaRow(season, +teamNumber, engineState)
    );
    const HISTORY_CHUNK_SIZE = 2000;

    await DATA_SOURCE.transaction(async (em) => {
        await em.getRepository(TeamEpa).save(rows, { chunk: 500 });

        for (let i = 0; i < result.history.length; i += HISTORY_CHUNK_SIZE) {
            let chunk = result.history
                .slice(i, i + HISTORY_CHUNK_SIZE)
                .map((h) => toHistoryRow(season, h, matchTimeByKey));
            await em.getRepository(TeamEpaHistory).save(chunk);
        }

        await em.getRepository(EpaLiveState).save(
            EpaLiveState.create({
                season,
                engineState: engineState as unknown as Record<string, unknown>,
                lastMatchTime:
                    result.lastMatch?.time != null ? new Date(result.lastMatch.time) : null,
                lastMatchId: result.lastMatch?.matchId ?? null,
                lastEventCode: result.lastMatch?.eventCode ?? null,
            })
        );
    });
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
        .andWhere("m.tournament_level = 'Quals'")
        .leftJoinAndMapMany(
            "m.scores",
            `match_score_${season}`,
            "ms",
            "m.event_season = ms.season AND m.event_code = ms.event_code AND m.id = ms.match_id"
        )
        .leftJoinAndMapMany(
            "m.teams",
            "team_match_participation",
            "tmp",
            "m.event_season = tmp.season AND m.event_code = tmp.event_code AND m.id = tmp.match_id"
        );

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

    await DATA_SOURCE.transaction(async (em) => {
        await em.getRepository(TeamEpa).save(teamRows, { chunk: 500 });

        for (let i = 0; i < historySnapshots.length; i += HISTORY_CHUNK_SIZE) {
            let chunk = historySnapshots
                .slice(i, i + HISTORY_CHUNK_SIZE)
                .map((h) => toHistoryRow(season, h, matchTimeByKey));
            await em.getRepository(TeamEpaHistory).save(chunk);
        }

        await em.getRepository(EpaLiveState).save(
            EpaLiveState.create({
                season,
                engineState: engineState as unknown as Record<string, unknown>,
                lastMatchTime: matchTimeOf(last),
                lastMatchId: last.id,
                lastEventCode: last.eventCode,
            })
        );
    });

    console.info(
        `Incrementally updated EPA for ${teamRows.length} teams (${newMatches.length} new matches)`
    );
}
