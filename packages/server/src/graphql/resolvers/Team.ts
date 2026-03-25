import { GraphQLFieldConfig, GraphQLInt, GraphQLObjectType } from "graphql";
import { dataLoaderResolverList, dataLoaderResolverSingle } from "../utils";
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
