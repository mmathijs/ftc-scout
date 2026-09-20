import {
    ALL_SEASONS,
    DESCRIPTORS,
    DateTy,
    EventTypeOption,
    FloatTy,
    IntTy,
    RegionOption,
    RemoteOption,
    Season,
    SortDir,
    StrTy,
    getEventTypes,
    getMatchStatSet,
    getRegionCodes,
    getTepStatSet,
    list,
    listTy,
    makeGQLEnum,
    nn,
    nullTy,
    wr,
} from "@ftc-scout/common";
import { GraphQLFieldConfig, GraphQLObjectType, GraphQLOutputType } from "graphql";
import { TeamEventParticipationGQL } from "../TeamEventParticipation";
import { TeamEventParticipation } from "../../../db/entities/dyn/team-event-participation";
import { DATA_SOURCE } from "../../../db/data-source";
import { NamingStrategyInterface } from "typeorm";
import {
    AllianceGQL,
    EventTypeOptionGQL,
    RegionOptionGQL,
    RemoteOptionGQL,
    SortDirGQL,
} from "../enums";
import { FilterGQL, TyFilterGQL, filterGQLToSql, isFilteringOn } from "./filter-gql";
import { MatchScore } from "../../../db/entities/dyn/match-score";
import { MatchGQL, singleSeasonScoreAwareMatchLoader } from "../Match";
import graphqlFields from "graphql-fields";
import { TeamEpaGQL, TeamOprGQL } from "../Team";
import { TeamEpa } from "../../../db/entities/TeamEpa";
import { TeamOpr } from "../../../db/entities/TeamOpr";
import { PredictionStat } from "../../../db/entities/PredictionStat";

function RecordGqlTy(wrapped: GraphQLOutputType, namePrefix: string): GraphQLObjectType {
    let rowTy = new GraphQLObjectType({
        name: `${namePrefix}RecordRow`,
        fields: {
            data: { type: nn(wrapped) },
            noFilterRank: IntTy,
            filterRank: IntTy,
            noFilterSkipRank: IntTy,
            filterSkipRank: IntTy,
        },
    });

    return new GraphQLObjectType({
        name: `${namePrefix}Records`,
        fields: {
            data: listTy(wr(nn(rowTy))),
            offset: IntTy,
            count: IntTy,
        },
    });
}

const SpecificAlliance = new GraphQLObjectType({
    name: "SpecificAlliance",
    fields: {
        match: { type: nn(MatchGQL) },
        alliance: { type: nn(AllianceGQL) },
    },
});

const TepRecordsGql = wr(nn(RecordGqlTy(TeamEventParticipationGQL, "Tep")));
const MatchRecordsGql = wr(nn(RecordGqlTy(SpecificAlliance, "Match")));

const EpaRecordsGql = new GraphQLObjectType({
    name: "EpaRecords",
    fields: {
        data: listTy(wr(nn(TeamEpaGQL))),
        offset: IntTy,
        count: IntTy,
    },
});

const OprRecordsGql = new GraphQLObjectType({
    name: "OprRecords",
    fields: {
        data: listTy(wr(nn(TeamOprGQL))),
        offset: IntTy,
        count: IntTy,
    },
});

// "All" combines Quals + Playoff; Quals/Playoff isolate one or the other.
const EpaStatLevelFilter = { All: "All", Quals: "Quals", Playoff: "Playoff" } as const;
type EpaStatLevelFilter = (typeof EpaStatLevelFilter)[keyof typeof EpaStatLevelFilter];
const EpaStatLevelFilterGQL = makeGQLEnum(EpaStatLevelFilter, "EpaStatLevelFilter");

// Cumulative: running total since the season's first scored match. Daily: just that day's own
// matches. Trailing: a rolling sum over the trailing `windowDays` days (e.g. "last 7 days").
const EpaStatWindow = { Cumulative: "Cumulative", Daily: "Daily", Trailing: "Trailing" } as const;
type EpaStatWindow = (typeof EpaStatWindow)[keyof typeof EpaStatWindow];
const EpaStatWindowGQL = makeGQLEnum(EpaStatWindow, "EpaStatWindow");

// Which team-strength model produced the prediction being graded. No "All" option here (unlike
// level) - summing correct-counts across different models wouldn't mean anything.
const PredictionSourceFilter = { Epa: "Epa", Opr: "Opr", WinLoss: "WinLoss" } as const;
type PredictionSourceFilter = (typeof PredictionSourceFilter)[keyof typeof PredictionSourceFilter];
const PredictionSourceFilterGQL = makeGQLEnum(PredictionSourceFilter, "PredictionSourceFilter");

const PredictionStatGQL = new GraphQLObjectType({
    name: "PredictionStat",
    fields: {
        date: StrTy,
        matchesConsidered: IntTy,
        accuracy: nullTy(FloatTy),
        brierScore: nullTy(FloatTy),
        logLoss: nullTy(FloatTy),
        scoreMae: nullTy(FloatTy),
        scoreRmse: nullTy(FloatTy),
    },
});

interface StatBucket {
    eligibleCount: number;
    classifiableCount: number;
    correctCount: number;
    brierSum: number;
    logLossSum: number;
    absErrSum: number;
    sqErrSum: number;
}
function emptyBucket(): StatBucket {
    return {
        eligibleCount: 0,
        classifiableCount: 0,
        correctCount: 0,
        brierSum: 0,
        logLossSum: 0,
        absErrSum: 0,
        sqErrSum: 0,
    };
}
function addBucket(acc: StatBucket, b: StatBucket) {
    acc.eligibleCount += b.eligibleCount;
    acc.classifiableCount += b.classifiableCount;
    acc.correctCount += b.correctCount;
    acc.brierSum += b.brierSum;
    acc.logLossSum += b.logLossSum;
    acc.absErrSum += b.absErrSum;
    acc.sqErrSum += b.sqErrSum;
}
function metricsFor(b: StatBucket, source: PredictionSourceFilter) {
    // WinLoss never predicts a score, so its abs/sq error sums are always exactly 0 - report that
    // as "no data" (null) rather than a misleadingly perfect 0.00 MAE/RMSE.
    let hasScoreModel = source != PredictionSourceFilter.WinLoss;
    return {
        matchesConsidered: b.eligibleCount,
        accuracy: b.classifiableCount > 0 ? b.correctCount / b.classifiableCount : null,
        brierScore: b.classifiableCount > 0 ? b.brierSum / b.classifiableCount : null,
        logLoss: b.classifiableCount > 0 ? b.logLossSum / b.classifiableCount : null,
        scoreMae: hasScoreModel && b.eligibleCount > 0 ? b.absErrSum / (b.eligibleCount * 2) : null,
        scoreRmse:
            hasScoreModel && b.eligibleCount > 0
                ? Math.sqrt(b.sqErrSum / (b.eligibleCount * 2))
                : null,
    };
}

function name(ns: NamingStrategyInterface, exp: string): string {
    return exp.match(/^\w+$/) ? ns.columnName(exp, undefined, []) : exp;
}

// Some columns have the same name in tep and team_epa, so rename them to tep.x and team_epa.x
const AMBIGUOUS_WITH_TEAM_EPA = new Set(["team_number", "season", "created_at", "updated_at"]);
function qualifyForTep(colName: string): string {
    return AMBIGUOUS_WITH_TEAM_EPA.has(colName) ? `tep.${colName}` : colName;
}

export const RecordQueries: Record<string, GraphQLFieldConfig<any, any>> = {
    tepRecords: {
        ...TepRecordsGql,
        args: {
            season: IntTy,
            sortBy: nullTy(StrTy),
            sortDir: { type: SortDirGQL },
            filter: { type: FilterGQL },
            region: { type: RegionOptionGQL },
            type: { type: EventTypeOptionGQL },
            remote: { type: RemoteOptionGQL },
            start: nullTy(DateTy),
            end: nullTy(DateTy),
            skip: IntTy,
            take: IntTy,
        },
        async resolve(
            _,
            {
                season,
                sortBy,
                sortDir,
                filter,
                region,
                type,
                remote,
                start,
                end,
                skip,
                take,
            }: {
                season: Season;
                sortBy: string | null;
                sortDir: SortDir | null;
                filter: TyFilterGQL;
                region: RegionOption | null;
                type: EventTypeOption | null;
                remote: RemoteOption | null;
                start: Date | null;
                end: Date | null;
                skip: number;
                take: number;
            }
        ) {
            let Tep = TeamEventParticipation[season];
            if (!Tep) return { data: [], offset: 0, count: 0 };

            take = Math.min(take, 50);

            let descriptor = DESCRIPTORS[season];
            let statSet = getTepStatSet(season, false);
            let ns = DATA_SOURCE.namingStrategy;

            // Sort Field
            let defaultRankerSqlName = descriptor.pensSubtract
                ? "oprTotalPoints"
                : "oprTotalPointsNp";
            let rankerExp = statSet.getStat(sortBy ?? "")?.sqlExpr ?? defaultRankerSqlName;
            let rankerSql = qualifyForTep(name(ns, rankerExp));

            let defaultSortSql = name(ns, defaultRankerSqlName) + " DESC NULLS LAST";

            // Sort Direction
            let sortDirSql = sortDir ?? SortDir.Desc;

            // Region
            let chosenRegion = region ?? RegionOption.All;

            // Event Type
            let chosenType = type ?? EventTypeOption.Competition;

            // Filter
            let filterSql = filter
                ? filterGQLToSql(filter, statSet, (s) => qualifyForTep(name(ns, s)))
                : "true";

            let contextAddedQ = Tep.createQueryBuilder("tep")
                .select("tep.event_code", "tep_ec")
                .addSelect("tep.team_number", "tep_tn")
                .addSelect(
                    `ROW_NUMBER() OVER (PARTITION BY tep."team_number" ORDER BY ${rankerSql} ${sortDirSql} NULLS LAST, ${defaultSortSql})`,
                    "ranking"
                )
                .addSelect(
                    `ROW_NUMBER() OVER (PARTITION BY tep."team_number", ${filterSql} ORDER BY ${rankerSql} ${sortDirSql} NULLS LAST, ${defaultSortSql})`,
                    "filter_ranking"
                )
                .addSelect(`${rankerSql}`, "ranker")
                .addSelect(name(ns, defaultRankerSqlName))
                .leftJoin("event", "e", "tep.season = e.season AND tep.event_code = e.code")
                .leftJoin(
                    "team_epa",
                    "team_epa",
                    "tep.season = team_epa.season AND tep.team_number = team_epa.team_number"
                )
                .andWhere("has_stats")
                .andWhere("NOT e.modified_rules");

            let countQ = Tep.createQueryBuilder("tep")
                .leftJoin("event", "e", "tep.season = e.season AND tep.event_code = e.code")
                .leftJoin(
                    "team_epa",
                    "team_epa",
                    "tep.season = team_epa.season AND tep.team_number = team_epa.team_number"
                )
                .where("has_stats")
                .andWhere("NOT e.modified_rules");

            if (chosenRegion != RegionOption.All) {
                contextAddedQ.andWhere("region_code IN (:...regions)", {
                    regions: getRegionCodes(chosenRegion),
                });
                countQ.andWhere("region_code IN (:...regions)", {
                    regions: getRegionCodes(chosenRegion),
                });
            }

            if (chosenType != EventTypeOption.All && chosenType != EventTypeOption.Competition) {
                contextAddedQ.andWhere("type IN (:...types)", {
                    types: getEventTypes(chosenType),
                });
                countQ.andWhere("type IN (:...types)", {
                    types: getEventTypes(chosenType),
                });
            }

            if (remote == RemoteOption.Trad) {
                contextAddedQ.andWhere("NOT remote");
                countQ.andWhere("NOT remote");
            } else if (remote == RemoteOption.Remote) {
                contextAddedQ.andWhere("remote");
                countQ.andWhere("remote");
            }

            if (start) {
                contextAddedQ.andWhere(`"start" >= :start`, {
                    start: start.toISOString().split("T")[0],
                });
                countQ.andWhere(`"start" >= :start`, { start: start.toISOString().split("T")[0] });
            }

            if (end) {
                contextAddedQ.andWhere(`"end" <= :end`, { end: end.toISOString().split("T")[0] });
                countQ.andWhere(`"end" <= :end`, { end: end.toISOString().split("T")[0] });
            }

            contextAddedQ.addSelect(filterSql, "is_in");

            let count = await countQ.andWhere(filterSql).getCount();

            if (skip >= count) {
                return { data: [], offset: skip, count };
            }

            let rankedQ = DATA_SOURCE.createQueryBuilder()
                .from("context_added", "context_added")
                .addSelect("*")
                .addSelect(
                    `RANK() over (order by ranking, ranker ${sortDirSql} NULLS LAST, ${defaultSortSql})`,
                    "no_filter_skip_rank"
                )
                .addSelect(
                    `RANK() over (partition by is_in order by filter_ranking, ranker ${sortDirSql} NULLS LAST, ${defaultSortSql})`,
                    "filter_skip_rank"
                )
                .addSelect(
                    `RANK() over (order by ranker ${sortDirSql} NULLS LAST, ${defaultSortSql})`,
                    "no_filter_rank"
                )
                .addSelect(
                    `RANK() over (partition by is_in order by ranker ${sortDirSql} NULLS LAST, ${defaultSortSql})`,
                    "filter_rank"
                )
                .orderBy("ranker", sortDir == SortDir.Asc ? "ASC" : "DESC", "NULLS LAST")
                .addOrderBy(name(ns, defaultRankerSqlName), "DESC", "NULLS LAST");

            let finalQ = await DATA_SOURCE.createQueryBuilder()
                .addCommonTableExpression(contextAddedQ, "context_added")
                .addCommonTableExpression(rankedQ, "ranked")
                .from("ranked", "ranked")
                .addSelect("filter_rank")
                .addSelect("no_filter_rank")
                .addSelect(
                    "CASE WHEN filter_ranking = 1 THEN filter_skip_rank END",
                    "filter_skip_rank"
                )
                .addSelect(
                    "CASE WHEN ranking = 1 THEN no_filter_skip_rank END",
                    "no_filter_skip_rank"
                )
                .addSelect("tep_ec")
                .addSelect("tep_tn")
                .where("is_in")
                .limit(take)
                .offset(skip)
                .getRawMany();

            let where = finalQ.map((r) => ({
                season,
                eventCode: r.tep_ec,
                teamNumber: r.tep_tn,
            }));
            let entities = await Tep.find({ where });

            let data = finalQ.map((r) => ({
                data: entities.find((e) => e.eventCode == r.tep_ec && e.teamNumber == r.tep_tn)!,
                noFilterRank: +r.no_filter_rank,
                filterRank: +r.filter_rank,
                noFilterSkipRank: +r.no_filter_skip_rank,
                filterSkipRank: +r.filter_skip_rank,
            }));

            return { data, offset: skip, count };
        },
    },
    epaRecords: {
        type: EpaRecordsGql,
        args: {
            season: IntTy,
            sortDir: { type: SortDirGQL },
            skip: IntTy,
            take: IntTy,
        },
        async resolve(
            _source,
            {
                season,
                sortDir,
                skip,
                take,
            }: { season: Season; sortDir: SortDir | null; skip: number; take: number }
        ) {
            take = Math.min(take, 50);

            let ns = DATA_SOURCE.namingStrategy;
            let colSql = name(ns, "epa");
            let dirSql = (sortDir ?? SortDir.Desc) == SortDir.Asc ? "ASC" : "DESC";

            let ranked = DATA_SOURCE.getRepository(TeamEpa)
                .createQueryBuilder("e")
                .select("*")
                .addSelect(`rank() over (order by ${colSql} desc)`, "rank")
                .where("season = :season", { season });

            let count = await DATA_SOURCE.getRepository(TeamEpa)
                .createQueryBuilder("e")
                .where("season = :season", { season })
                .getCount();

            let rows = await DATA_SOURCE.createQueryBuilder()
                .addCommonTableExpression(ranked, "ranked")
                .from("ranked", "ranked")
                .orderBy(colSql, dirSql as "ASC" | "DESC")
                .offset(skip)
                .limit(take)
                .getRawMany();

            let data = rows.map((r) => ({
                season,
                teamNumber: +r.team_number,
                epa: +r.epa,
                matchesPlayed: +r.matches_played,
                rank: +r.rank,
            }));

            return { data, offset: skip, count };
        },
    },
    oprRecords: {
        type: OprRecordsGql,
        args: {
            season: IntTy,
            sortDir: { type: SortDirGQL },
            skip: IntTy,
            take: IntTy,
        },
        async resolve(
            _source,
            {
                season,
                sortDir,
                skip,
                take,
            }: { season: Season; sortDir: SortDir | null; skip: number; take: number }
        ) {
            take = Math.min(take, 50);

            let ns = DATA_SOURCE.namingStrategy;
            let colSql = name(ns, "opr");
            let dirSql = (sortDir ?? SortDir.Desc) == SortDir.Asc ? "ASC" : "DESC";

            let ranked = DATA_SOURCE.getRepository(TeamOpr)
                .createQueryBuilder("o")
                .select("*")
                .addSelect(`rank() over (order by ${colSql} desc)`, "rank")
                .where("season = :season", { season });

            let count = await DATA_SOURCE.getRepository(TeamOpr)
                .createQueryBuilder("o")
                .where("season = :season", { season })
                .getCount();

            let rows = await DATA_SOURCE.createQueryBuilder()
                .addCommonTableExpression(ranked, "ranked")
                .from("ranked", "ranked")
                .orderBy(colSql, dirSql as "ASC" | "DESC")
                .offset(skip)
                .limit(take)
                .getRawMany();

            let data = rows.map((r) => ({
                season,
                teamNumber: +r.team_number,
                opr: +r.opr,
                matchesPlayed: +r.matches_played,
                rank: +r.rank,
            }));

            return { data, offset: skip, count };
        },
    },
    predictionStats: {
        type: list(nn(PredictionStatGQL)),
        args: {
            season: IntTy,
            source: { type: PredictionSourceFilterGQL },
            level: { type: EpaStatLevelFilterGQL },
            window: { type: EpaStatWindowGQL },
            windowDays: nullTy(IntTy),
        },
        async resolve(
            _source,
            {
                season,
                source,
                level,
                window,
                windowDays,
            }: {
                season: Season;
                source: PredictionSourceFilter | null;
                level: EpaStatLevelFilter | null;
                window: EpaStatWindow | null;
                windowDays: number | null;
            }
        ) {
            if (ALL_SEASONS.indexOf(season) == -1) throw "invalid season";
            source ??= PredictionSourceFilter.Epa;
            level ??= EpaStatLevelFilter.All;
            window ??= EpaStatWindow.Cumulative;
            windowDays ??= 7;

            let qb = DATA_SOURCE.getRepository(PredictionStat)
                .createQueryBuilder("s")
                .where("season = :season", { season })
                .andWhere("source = :source", { source });
            if (level != EpaStatLevelFilter.All) qb.andWhere("level = :level", { level });
            let rows = await qb.orderBy("date", "ASC").getMany();

            // Quals + Playoff rows land on the same date when level=All, so combine them there.
            let byDate = new Map<string, StatBucket>();
            for (let r of rows) {
                let bucket = byDate.get(r.date) ?? emptyBucket();
                addBucket(bucket, r);
                byDate.set(r.date, bucket);
            }
            let dates = [...byDate.keys()].sort();

            if (window == EpaStatWindow.Daily) {
                return dates.map((date) => ({ date, ...metricsFor(byDate.get(date)!, source!) }));
            }

            if (window == EpaStatWindow.Cumulative) {
                let running = emptyBucket();
                return dates.map((date) => {
                    addBucket(running, byDate.get(date)!);
                    return { date, ...metricsFor(running, source!) };
                });
            }

            // Trailing: sum every date within the last `windowDays` days (inclusive) of this one.
            let dateMs = dates.map((d) => new Date(d).getTime());
            const DAY_MS = 24 * 3600 * 1000;
            return dates.map((date, i) => {
                let cutoff = dateMs[i] - windowDays! * DAY_MS;
                let acc = emptyBucket();
                for (let j = i; j >= 0 && dateMs[j] > cutoff; j--) {
                    addBucket(acc, byDate.get(dates[j])!);
                }
                return { date, ...metricsFor(acc, source!) };
            });
        },
    },
    matchRecords: {
        ...MatchRecordsGql,
        args: {
            season: IntTy,
            sortBy: nullTy(StrTy),
            sortDir: { type: SortDirGQL },
            filter: { type: FilterGQL },
            region: { type: RegionOptionGQL },
            type: { type: EventTypeOptionGQL },
            remote: { type: RemoteOptionGQL },
            start: nullTy(DateTy),
            end: nullTy(DateTy),
            skip: IntTy,
            take: IntTy,
        },
        async resolve(
            _source,
            {
                season,
                sortBy,
                sortDir,
                filter,
                region,
                type,
                remote,
                start,
                end,
                skip,
                take,
            }: {
                season: Season;
                sortBy: string | null;
                sortDir: SortDir | null;
                filter: TyFilterGQL;
                region: RegionOption | null;
                type: EventTypeOption | null;
                remote: RemoteOption | null;
                start: Date | null;
                end: Date | null;
                skip: number;
                take: number;
            },
            _context,
            info
        ) {
            let Ms = MatchScore[season];
            if (!Ms) return { data: [], offset: 0, count: 0 };

            take = Math.min(take, 50);

            let descriptor = DESCRIPTORS[season];
            let statSet = getMatchStatSet(season, false);
            let ns = DATA_SOURCE.namingStrategy;

            // Sort Field
            let defaultRankerSqlName = descriptor.pensSubtract ? "totalPoints" : "totalPointsNp";
            let rankerExp = statSet.getStat(sortBy ?? "")?.sqlExpr ?? defaultRankerSqlName;
            let rankerSql = name(ns, rankerExp);

            let defaultSortSql = name(ns, defaultRankerSqlName) + " DESC NULLS LAST";

            // Sort Direction
            let sortDirSql = sortDir ?? SortDir.Desc;

            // Region
            let chosenRegion = region ?? RegionOption.All;

            // Event Type
            let chosenType = type ?? EventTypeOption.Competition;

            // Filter
            let filterSql = filter ? filterGQLToSql(filter, statSet, (s) => name(ns, s)) : "true";

            let joinOurTeams =
                isFilteringOn(filter, (id) => id == "team1This") ||
                isFilteringOn(filter, (id) => id == "team2This") ||
                sortBy == "team1This" ||
                sortBy == "team2This";

            let joinOtherTeams =
                isFilteringOn(filter, (id) => id == "team1Opp") ||
                isFilteringOn(filter, (id) => id == "team2Opp") ||
                sortBy == "team1Opp" ||
                sortBy == "team2Opp";

            let joinOtherScore =
                isFilteringOn(filter, (id) => id.endsWith("Opp")) || sortBy?.endsWith("Opp");

            let contextAddedQ = Ms.createQueryBuilder("ms")
                .select("ms.event_code", "ms_ec")
                .addSelect("ms.match_id", "ms_id")
                .addSelect("ms.alliance", "ms_al")
                .addSelect(`${rankerSql}`, "ranker")
                .addSelect("ms." + defaultRankerSqlName, name(ns, defaultRankerSqlName))
                .leftJoin("event", "e", "ms.season = e.season AND ms.event_code = e.code")
                .where("NOT e.modified_rules");

            let countQ = Ms.createQueryBuilder("ms")
                .leftJoin("event", "e", "ms.season = e.season AND ms.event_code = e.code")
                .where("NOT e.modified_rules");

            if (joinOurTeams) {
                contextAddedQ.leftJoin(
                    "team_match_participation",
                    "tmp1",
                    `ms.season = tmp1.season AND ms.event_code = tmp1.event_code AND ms.match_id = 
                    tmp1.match_id AND ms.alliance = tmp1.alliance AND (tmp1.station = 'Solo' OR 
                    tmp1.station = 'One')`
                );
                countQ.leftJoin(
                    "team_match_participation",
                    "tmp1",
                    `ms.season = tmp1.season AND ms.event_code = tmp1.event_code AND ms.match_id = 
                    tmp1.match_id AND ms.alliance = tmp1.alliance AND (tmp1.station = 'Solo' OR 
                    tmp1.station = 'One')`
                );
                contextAddedQ.leftJoin(
                    "team_match_participation",
                    "tmp2",
                    `ms.season = tmp2.season AND ms.event_code = tmp2.event_code AND ms.match_id = 
                    tmp2.match_id AND ms.alliance = tmp2.alliance AND tmp2.station = 'Two'`
                );
                countQ.leftJoin(
                    "team_match_participation",
                    "tmp2",
                    `ms.season = tmp2.season AND ms.event_code = tmp2.event_code AND ms.match_id = 
                    tmp2.match_id AND ms.alliance = tmp2.alliance AND tmp2.station = 'Two'`
                );
            }

            if (joinOtherTeams) {
                contextAddedQ.leftJoin(
                    "team_match_participation",
                    "tmp1Opp",
                    `ms.season = tmp1Opp.season AND ms.event_code = tmp1Opp.event_code AND ms.match_id = 
                    tmp1Opp.match_id AND ms.alliance <> tmp1Opp.alliance AND tmp1Opp.station = 'One'`
                );
                countQ.leftJoin(
                    "team_match_participation",
                    "tmp1Opp",
                    `ms.season = tmp1Opp.season AND ms.event_code = tmp1Opp.event_code AND ms.match_id = 
                    tmp1Opp.match_id AND ms.alliance <> tmp1Opp.alliance AND tmp1Opp.station = 'One'`
                );
                contextAddedQ.leftJoin(
                    "team_match_participation",
                    "tmp2Opp",
                    `ms.season = tmp2Opp.season AND ms.event_code = tmp2Opp.event_code AND ms.match_id = 
                    tmp2Opp.match_id AND ms.alliance <> tmp2Opp.alliance AND tmp2Opp.station = 'Two'`
                );
                countQ.leftJoin(
                    "team_match_participation",
                    "tmp2Opp",
                    `ms.season = tmp2Opp.season AND ms.event_code = tmp2Opp.event_code AND ms.match_id = 
                    tmp2Opp.match_id AND ms.alliance <> tmp2Opp.alliance AND tmp2Opp.station = 'Two'`
                );
            }

            if (joinOtherScore) {
                contextAddedQ.leftJoin(
                    `match_score_${season}`,
                    "msOpp",
                    `ms.season = msOpp.season AND ms.event_code = msOpp.eventCode AND ms.match_id = 
                    msOpp.matchId AND ms.alliance <> msOpp.alliance`
                );
                countQ.leftJoin(
                    `match_score_${season}`,
                    "msOpp",
                    `ms.season = msOpp.season AND ms.event_code = msOpp.eventCode AND ms.match_id = 
                    msOpp.matchId AND ms.alliance <> msOpp.alliance`
                );
            }

            if (chosenRegion != RegionOption.All) {
                contextAddedQ.andWhere("region_code IN (:...regions)", {
                    regions: getRegionCodes(chosenRegion),
                });
                countQ.andWhere("region_code IN (:...regions)", {
                    regions: getRegionCodes(chosenRegion),
                });
            }

            if (chosenType != EventTypeOption.All && chosenType != EventTypeOption.Competition) {
                contextAddedQ.andWhere("type IN (:...types)", {
                    types: getEventTypes(chosenType),
                });
                countQ.andWhere("type IN (:...types)", {
                    types: getEventTypes(chosenType),
                });
            }

            if (remote == RemoteOption.Trad) {
                contextAddedQ.andWhere("NOT remote");
                countQ.andWhere("NOT remote");
            } else if (remote == RemoteOption.Remote) {
                contextAddedQ.andWhere("remote");
                countQ.andWhere("remote");
            }

            if (start) {
                contextAddedQ.andWhere(`"start" >= :start`, {
                    start: start.toISOString().split("T")[0],
                });
                countQ.andWhere(`"start" >= :start`, { start: start.toISOString().split("T")[0] });
            }

            if (end) {
                contextAddedQ.andWhere(`"end" <= :end`, { end: end.toISOString().split("T")[0] });
                countQ.andWhere(`"end" <= :end`, { end: end.toISOString().split("T")[0] });
            }

            contextAddedQ.addSelect(filterSql, "is_in");

            let count = await countQ.andWhere(filterSql).getCount();

            if (skip >= count) {
                return { data: [], offset: skip, count };
            }

            let rankedQ = DATA_SOURCE.createQueryBuilder()
                .from("context_added", "context_added")
                .addSelect("*")
                .addSelect(
                    `RANK() over (order by ranker ${sortDirSql} NULLS LAST, ${defaultSortSql})`,
                    "no_filter_rank"
                )
                .addSelect(
                    `RANK() over (partition by is_in order by ranker ${sortDirSql} NULLS LAST, ${defaultSortSql})`,
                    "filter_rank"
                )
                .orderBy("ranker", sortDir == SortDir.Asc ? "ASC" : "DESC", "NULLS LAST")
                .addOrderBy(name(ns, defaultRankerSqlName), "DESC", "NULLS LAST");

            let finalQ = await DATA_SOURCE.createQueryBuilder()
                .addCommonTableExpression(contextAddedQ, "context_added")
                .addCommonTableExpression(rankedQ, "ranked")
                .from("ranked", "ranked")
                .addSelect("filter_rank")
                .addSelect("no_filter_rank")
                .addSelect("filter_rank", "filter_skip_rank")
                .addSelect("no_filter_rank", "no_filter_skip_rank")
                .addSelect("ms_ec")
                .addSelect("ms_id")
                .addSelect("ms_al")
                .where("is_in")
                .limit(take)
                .offset(skip)
                .getRawMany();

            let where = finalQ.map((r) => ({
                eventSeason: season,
                eventCode: r.ms_ec,
                id: r.ms_id,
            }));
            let fields = graphqlFields(info)?.data?.data?.match;
            let entities = await singleSeasonScoreAwareMatchLoader(
                where,
                [],
                fields && "scores" in fields,
                fields && "teams" in fields
            );

            let data = finalQ.map((r) => ({
                data: {
                    match: entities.find((e) => e.eventCode == r.ms_ec && e.id == r.ms_id)!,
                    alliance: r.ms_al,
                },
                noFilterRank: +r.no_filter_rank,
                filterRank: +r.filter_rank,
                noFilterSkipRank: +r.no_filter_skip_rank,
                filterSkipRank: +r.filter_skip_rank,
            }));

            return { data, offset: skip, count };
        },
    },
};
