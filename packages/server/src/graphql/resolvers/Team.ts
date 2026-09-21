import { GraphQLFieldConfig, GraphQLInt, GraphQLObjectType } from "graphql";
import { dataLoaderResolver, dataLoaderResolverList, dataLoaderResolverSingle } from "../utils";
import {
    ALL_SEASONS,
    DateTimeTy,
    FloatTy,
    IntTy,
    RegionOption,
    StrTy,
    fuzzySearch,
    getRegionCodes,
    groupBy,
    list,
    listTy,
    nn,
    nullTy,
    CURRENT_SEASON,
} from "@ftc-scout/common";
import { Team } from "../../db/entities/Team";
import { In } from "typeorm";
import { AwardGQL, teamAwareAwardLoader } from "./Award";
import { Award } from "../../db/entities/Award";
import { Season } from "@ftc-scout/common";
import { TeamMatchParticipationGQL } from "./TeamMatchParticipation";
import { TeamMatchParticipation } from "../../db/entities/TeamMatchParticipation";
import { LocationGQL } from "../objs/Location";
import { TeamEventParticipation } from "../../db/entities/dyn/team-event-participation";
import { TeamEventParticipationGQL } from "./TeamEventParticipation";
import { RegionOptionGQL } from "./enums";
import { DATA_SOURCE } from "../../db/data-source";
import { getQuickStatsViewName } from "../../db/quickstats-materialized-view";
import { TeamEpaHistory } from "../../db/entities/TeamEpaHistory";
import { teamEpaRankLoader } from "../../db/loaders/team-epa-loader";
import { TeamEpa } from "../../db/entities/TeamEpa";
import { TeamOpr } from "../../db/entities/TeamOpr";
import {
    teamEpaCategoryRankLoader,
    teamEpaCategoryHistoryLoader,
} from "../../db/loaders/team-epa-category-loader";

const QuickStatGQL = new GraphQLObjectType({
    name: "QuickStat",
    fields: {
        value: FloatTy,
        rank: IntTy,
    },
});
const QuickStatsGQL = new GraphQLObjectType({
    name: "QuickStats",
    fields: {
        season: IntTy,
        number: IntTy,
        tot: { type: nn(QuickStatGQL) },
        auto: { type: nn(QuickStatGQL) },
        dc: { type: nn(QuickStatGQL) },
        eg: { type: nn(QuickStatGQL) },
        count: IntTy,
    },
});

type SeasonTeamKey = { season: Season; teamNumber: number };

export const TeamEpaGQL: GraphQLObjectType = new GraphQLObjectType({
    name: "TeamEpa",
    fields: () => ({
        season: IntTy,
        teamNumber: IntTy,
        epa: FloatTy,
        matchesPlayed: IntTy,
        rank: IntTy,
        // Cross-referenced against TeamOpr, for pages that want to show both ratings side by side
        // (e.g. the records page's Rankings tab) without a second round trip.
        opr: {
            type: nullTy(FloatTy).type,
            resolve: dataLoaderResolver<SeasonTeamKey, number | null, SeasonTeamKey, {}, TeamOpr>(
                (e) => ({ season: e.season, teamNumber: e.teamNumber }),
                (keys) => TeamOpr.find({ where: keys }),
                (keys, results) =>
                    keys.map(
                        (k) =>
                            results.find(
                                (r) => r.season == k.season && r.teamNumber == k.teamNumber
                            )?.opr ?? null
                    )
            ),
        },
        team: {
            type: nn(TeamGQL),
            resolve: dataLoaderResolverSingle<{ teamNumber: number }, Team, number>(
                (e) => e.teamNumber,
                (keys) => Team.find({ where: { number: In(keys) } }),
                (k, t) => k == t.number
            ),
        },
    }),
});

export const TeamOprGQL: GraphQLObjectType = new GraphQLObjectType({
    name: "TeamOpr",
    fields: () => ({
        season: IntTy,
        teamNumber: IntTy,
        opr: FloatTy,
        matchesPlayed: IntTy,
        rank: IntTy,
        // Cross-referenced against TeamEpa - see TeamEpaGQL.opr's comment.
        epa: {
            type: nullTy(FloatTy).type,
            resolve: dataLoaderResolver<SeasonTeamKey, number | null, SeasonTeamKey, {}, TeamEpa>(
                (e) => ({ season: e.season, teamNumber: e.teamNumber }),
                (keys) => TeamEpa.find({ where: keys }),
                (keys, results) =>
                    keys.map(
                        (k) =>
                            results.find(
                                (r) => r.season == k.season && r.teamNumber == k.teamNumber
                            )?.epa ?? null
                    )
            ),
        },
        team: {
            type: nn(TeamGQL),
            resolve: dataLoaderResolverSingle<{ teamNumber: number }, Team, number>(
                (e) => e.teamNumber,
                (keys) => Team.find({ where: { number: In(keys) } }),
                (k, t) => k == t.number
            ),
        },
    }),
});

// Batched via teamEpaRankLoader - one rank()-window scan per season across a whole tick's
// teams, not one per team.
export async function getTeamEpa(teamNumber: number, season: Season) {
    let res = await teamEpaRankLoader.load(`${season}:${teamNumber}`);
    if (!res) return null;

    return { season, teamNumber, epa: res.epa, matchesPlayed: res.matchesPlayed, rank: res.rank };
}

const TeamEpaHistoryGQL = new GraphQLObjectType({
    name: "TeamEpaHistoryPoint",
    fields: {
        season: IntTy,
        eventCode: StrTy,
        matchId: IntTy,
        epa: FloatTy,
        matchesPlayed: IntTy,
        matchTime: nullTy(DateTimeTy),
    },
});

const TeamEpaCategoryGQL = new GraphQLObjectType({
    name: "TeamEpaCategory",
    fields: {
        season: IntTy,
        teamNumber: IntTy,
        category: StrTy,
        epa: FloatTy,
        matchesPlayed: IntTy,
        rank: IntTy,
    },
});

async function getTeamEpaCategory(teamNumber: number, season: Season, category: string) {
    let res = await teamEpaCategoryRankLoader.load(`${season}:${teamNumber}:${category}`);
    if (!res) return null;

    return {
        season,
        teamNumber,
        category,
        epa: res.epa,
        matchesPlayed: res.matchesPlayed,
        rank: res.rank,
    };
}

const TeamEpaGroupGQL = new GraphQLObjectType({
    name: "TeamEpaGroup",
    fields: {
        // Null on seasons with no endgame
        auto: { type: TeamEpaCategoryGQL },
        dc: { type: TeamEpaCategoryGQL },
        eg: { type: TeamEpaCategoryGQL },
        total: { type: TeamEpaGQL },
    },
});

const TeamEpaGroupHistoryGQL = new GraphQLObjectType({
    name: "TeamEpaGroupHistory",
    fields: {
        auto: { type: list(nn(TeamEpaHistoryGQL)) },
        dc: { type: list(nn(TeamEpaHistoryGQL)) },
        eg: { type: list(nn(TeamEpaHistoryGQL)) },
        total: { type: list(nn(TeamEpaHistoryGQL)) },
    },
});

async function getTeamEpaCategoryHistory(teamNumber: number, season: Season, category: string) {
    let rows = await teamEpaCategoryHistoryLoader.load(`${season}:${teamNumber}:${category}`);
    // Mirrors epaHistory's filter above - matchesPlayed == 0 is the pre-season bootstrap state,
    // not a real match snapshot.
    return rows.filter((r) => r.matchesPlayed > 0);
}

let cachedQSCount: Partial<Record<Season, { count: number; time: number }>> = {};
let cacheTime = 1000 * 60 * 5; // 5 minutes

async function getQuickStatCount(season: Season, region: RegionOption | null) {
    let view = getQuickStatsViewName(season);
    let specialRegion = region && region != RegionOption.All;

    let cached = cachedQSCount[season];
    if (!specialRegion && cached && Date.now() - cached.time < cacheTime) {
        return cached.count;
    }

    let count: number;
    if (specialRegion) {
        let q = DATA_SOURCE.createQueryBuilder()
            .from(view, "qs")
            .select("count(*)", "count")
            .where("region_code IN (:...regions)", { regions: getRegionCodes(region!) });
        let raw = await q.getRawOne();
        count = +raw.count;
    } else {
        let q = DATA_SOURCE.createQueryBuilder()
            .from(view, "qs")
            .select("max(team_count)", "count");
        let raw = await q.getRawOne();
        count = +(raw?.count ?? 0);
    }

    if (!specialRegion) {
        cachedQSCount[season] = { count, time: Date.now() };
    }

    return count;
}

export async function getQuickStats(number: number, season: Season, region: RegionOption | null) {
    let view = getQuickStatsViewName(season);
    let specialRegion = region && region != RegionOption.All;

    let res;
    if (specialRegion) {
        // Preserve current semantics: ranks are computed within the filtered region scope.
        let ranked = DATA_SOURCE.createQueryBuilder()
            .from(view, "qs")
            .select("*")
            .addSelect("rank() over (order by tot DESC)", "tot_rank")
            .addSelect("rank() over (order by auto DESC)", "auto_rank")
            .addSelect("rank() over (order by dc DESC)", "dc_rank")
            .addSelect("rank() over (order by eg DESC)", "eg_rank")
            .where("region_code IN (:...regions)", { regions: getRegionCodes(region!) });

        res = await DATA_SOURCE.createQueryBuilder()
            .addCommonTableExpression(ranked, "region_ranked")
            .from("region_ranked", "ranks")
            .select("*")
            .where("team_number = :number", { number })
            .getRawOne();
    } else {
        res = await DATA_SOURCE.createQueryBuilder()
            .from(view, "qs")
            .select("*")
            .where("team_number = :number", { number })
            .getRawOne();
    }

    if (!res) return null;

    return {
        season,
        number: number,
        tot: { value: res.tot, rank: +res.tot_rank },
        auto: { value: res.auto, rank: +res.auto_rank },
        dc: { value: res.dc, rank: +res.dc_rank },
        eg: { value: res.eg, rank: +res.eg_rank },
        count: await getQuickStatCount(season, region),
    };
}

export const TeamGQL: GraphQLObjectType = new GraphQLObjectType({
    name: "Team",
    fields: () => ({
        number: IntTy,
        name: StrTy,
        schoolName: StrTy,
        sponsors: listTy(StrTy),
        location: {
            type: nn(LocationGQL),
            resolve: (t) => ({ city: t.city, state: t.state, country: t.country }),
        },
        rookieYear: IntTy,
        activeSeasons: {
            type: list(GraphQLInt),
            resolve: async (t) => {
                let seasons = await DATA_SOURCE.getRepository(TeamMatchParticipation)
                    .createQueryBuilder("tmp")
                    .select("DISTINCT season")
                    .where("team_number = :number", { number: t.number })
                    .getRawMany();
                return seasons.map((s) => s.season).concat(CURRENT_SEASON);
            },
        },
        website: nullTy(StrTy),
        createdAt: DateTimeTy,
        updatedAt: DateTimeTy,
        awards: {
            type: list(nn(AwardGQL)),
            args: { season: nullTy(IntTy) },
            resolve: dataLoaderResolverList<
                Team,
                Award,
                { season?: Season; teamNumber: number },
                { season: Season | null }
            >(
                (team, a) =>
                    a.season != null
                        ? { season: a.season, teamNumber: team.number }
                        : { teamNumber: team.number },
                teamAwareAwardLoader
            ),
        },
        matches: {
            type: list(nn(TeamMatchParticipationGQL)),
            args: { season: nullTy(IntTy), eventCode: nullTy(StrTy) },
            resolve: dataLoaderResolverList<
                Team,
                TeamMatchParticipation,
                { season?: Season; eventCode?: string; teamNumber: number },
                { season: Season | null; eventCode: string | null }
            >(
                (t, { season, eventCode }) => ({
                    teamNumber: t.number,
                    ...(season != null ? { season } : {}),
                    ...(eventCode != null ? { eventCode } : {}),
                }),
                (keys) => TeamMatchParticipation.find({ where: keys })
            ),
        },
        events: {
            type: list(nn(TeamEventParticipationGQL)),
            args: { season: IntTy },
            resolve: dataLoaderResolverList<
                Team,
                TeamEventParticipation,
                { season: Season; teamNumber: number },
                { season: Season }
            >(
                (t, { season }) => ({ season, teamNumber: t.number }),
                async (keys) => {
                    let groups = groupBy(keys, (k) => k.season);
                    let qs = Object.entries(groups).map(([season, k]) =>
                        TeamEventParticipation[+season as Season].find({ where: k })
                    );
                    return (await Promise.all(qs)).flat();
                }
            ),
        },

        quickStats: {
            type: QuickStatsGQL,
            args: { season: IntTy, region: { type: RegionOptionGQL } },
            resolve: async (
                team,
                { season, region }: { season: Season; region: RegionOption | null }
            ) => {
                if (ALL_SEASONS.indexOf(season) == -1) throw "invalid season";
                return getQuickStats(team.number, season, region);
            },
        },

        epa: {
            type: TeamEpaGQL,
            args: { season: IntTy },
            resolve: async (team, { season }: { season: Season }) => {
                if (ALL_SEASONS.indexOf(season) == -1) throw "invalid season";
                return getTeamEpa(team.number, season);
            },
        },

        epaHistory: {
            type: list(nn(TeamEpaHistoryGQL)),
            args: { season: IntTy },
            resolve: async (team, { season }: { season: Season }) => {
                if (ALL_SEASONS.indexOf(season) == -1) throw "invalid season";
                return (
                    TeamEpaHistory.createQueryBuilder("h")
                        .where("season = :season", { season })
                        .andWhere("team_number = :teamNumber", { teamNumber: team.number })
                        // if matches_played == 0 there is no history
                        .andWhere("matches_played > 0")
                        .orderBy("matches_played", "ASC")
                        .getMany()
                );
            },
        },

        epaGroup: {
            type: TeamEpaGroupGQL,
            args: { season: IntTy },
            resolve: async (team, { season }: { season: Season }) => {
                if (ALL_SEASONS.indexOf(season) == -1) throw "invalid season";
                let [auto, dc, eg, total] = await Promise.all([
                    getTeamEpaCategory(team.number, season, "auto"),
                    getTeamEpaCategory(team.number, season, "dc"),
                    getTeamEpaCategory(team.number, season, "eg"),
                    getTeamEpa(team.number, season),
                ]);
                return { auto, dc, eg, total };
            },
        },

        epaGroupHistory: {
            type: TeamEpaGroupHistoryGQL,
            args: { season: IntTy },
            resolve: async (team, { season }: { season: Season }) => {
                if (ALL_SEASONS.indexOf(season) == -1) throw "invalid season";
                let [auto, dc, eg, total] = await Promise.all([
                    getTeamEpaCategoryHistory(team.number, season, "auto"),
                    getTeamEpaCategoryHistory(team.number, season, "dc"),
                    getTeamEpaCategoryHistory(team.number, season, "eg"),
                    TeamEpaHistory.createQueryBuilder("h")
                        .where("season = :season", { season })
                        .andWhere("team_number = :teamNumber", { teamNumber: team.number })
                        .andWhere("matches_played > 0")
                        .orderBy("matches_played", "ASC")
                        .getMany(),
                ]);
                return { auto, dc, eg, total };
            },
        },
    }),
});

export const TeamQueries: Record<string, GraphQLFieldConfig<any, any>> = {
    teamByNumber: {
        type: TeamGQL,
        args: { number: IntTy },
        resolve: dataLoaderResolverSingle<{}, Team, number, { number: number }>(
            (_, a) => a.number,
            (keys) => Team.find({ where: { number: In(keys) } }),
            (k, r) => k == r.number
        ),
    },
    teamByName: {
        type: TeamGQL,
        args: { name: StrTy },
        resolve: dataLoaderResolverSingle<{}, Team, string, { name: string }>(
            (_, a) => a.name,
            (keys) => Team.find({ where: { name: In(keys) } }),
            (k, r) => k == r.name
        ),
    },

    teamsSearch: {
        type: list(nn(TeamGQL)),
        args: {
            region: { type: RegionOptionGQL },
            limit: nullTy(IntTy),
            searchText: nullTy(StrTy),
        },
        resolve: async (
            _,
            {
                region,
                limit,
                searchText,
            }: {
                region: RegionOption | null;
                limit: number | null;
                searchText: string | null;
            }
        ) => {
            let q = DATA_SOURCE.getRepository(Team).createQueryBuilder("t").distinctOn(["number"]);

            if (region && region != RegionOption.All) {
                q.andWhere("t.region_code IN (:...regions)", {
                    regions: getRegionCodes(region),
                });
            }

            if (limit && (!searchText || searchText.trim() == "")) {
                q.limit(limit);
            }

            let entities = await q.getMany();

            if (searchText) searchText = searchText.trim();
            if (searchText && searchText != "") {
                if (searchText.match(/^\d+$/)) {
                    entities = entities
                        .filter((e) => (e.number + "").startsWith(searchText!))
                        .sort((a, b) => a.number - b.number);
                } else {
                    let res = fuzzySearch(entities, searchText, limit ?? undefined, "name", true);
                    entities = res.map((d) => d.document);
                }
            }

            return entities;
        },
    },
};
