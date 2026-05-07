import { GraphQLObjectType, GraphQLResolveInfo } from "graphql";
import { dataLoaderResolverSingle, keyListToWhereClause } from "../utils";
import { BoolTy, DateTimeTy, IntTy, StrTy, list, nn, nullTy } from "@ftc-scout/common";
import { Match } from "../../db/entities/Match";
import { Event } from "../../db/entities/Event";
import { TournamentLevelGQL } from "./enums";
import { Season } from "@ftc-scout/common";
import { MatchScoresUnionGQL } from "../dyn/dyn-types-schema";
import { frontendMSFromDB } from "../dyn/match-score";
import { DATA_SOURCE } from "../../db/data-source";
import graphqlFields from "graphql-fields";
import { FindOptionsWhere } from "typeorm";
import { TeamMatchParticipationGQL } from "./TeamMatchParticipation";
import { EventGQL } from "./Event";
import { VideoGQL } from "./Video";
import { MatchScore } from "../../db/entities/dyn/match-score";
import { TeamMatchParticipation } from "../../db/entities/TeamMatchParticipation";

export const MatchGQL: GraphQLObjectType = new GraphQLObjectType({
    name: "Match",
    fields: () => ({
        season: {
            ...IntTy,
            resolve: (m: Match) => m.eventSeason,
        },
        eventCode: StrTy,
        id: IntTy,
        hasBeenPlayed: BoolTy,
        scheduledStartTime: nullTy(DateTimeTy),
        actualStartTime: nullTy(DateTimeTy),
        postResultTime: nullTy(DateTimeTy),
        tournamentLevel: { type: nn(TournamentLevelGQL) },
        series: IntTy,
        matchNum: IntTy,
        description: StrTy,
        createdAt: DateTimeTy,
        updatedAt: DateTimeTy,

        // Must use aware loader
        scores: {
            type: MatchScoresUnionGQL,
            resolve: (m) => frontendMSFromDB(m.scores),
        },
        teams: { type: list(nn(TeamMatchParticipationGQL)) },

        videos: { type: list(nn(VideoGQL)), resolve: (m) => m.videos || [] },

        event: {
            type: nn(EventGQL),
            resolve: dataLoaderResolverSingle<Match, Event, { season: Season; code: string }>(
                (m) => ({ season: m.eventSeason, code: m.eventCode }),
                (keys) => Event.find({ where: keys })
            ),
        },
    }),
});

export function singleSeasonScoreAwareMatchLoader<
    K extends { eventSeason: Season } & FindOptionsWhere<Match>
>(
    keys: K[],
    info: GraphQLResolveInfo[],
    includeScores = false,
    includeTeams = false,
    includeVideos = false
): Promise<Match[]> {
    includeScores ||= info.some((i) => "scores" in graphqlFields(i));
    includeTeams ||= info.some((i) => "teams" in graphqlFields(i));
    includeVideos ||= info.some((i) => "videos" in graphqlFields(i));
    let season = keys[0].eventSeason as Season;

    let q = DATA_SOURCE.getRepository(Match)
        .createQueryBuilder("m")
        .where(keyListToWhereClause("m", keys));

    q.addOrderBy("m.match_id", "ASC");

    if (includeVideos) {
        q.leftJoinAndMapMany(
            "m.videos",
            "video",
            "v",
            "m.event_season = v.event_season AND m.event_code = v.event_code AND m.id = v.match_id"
        );
    }

    return q.getMany().then(async (matches) => {
        if (matches.length === 0) return matches;

        const matchKey = (eventSeason: Season, eventCode: string, id: number) =>
            `${eventSeason}:${eventCode}:${id}`;
        const matchMap = new Map(
            matches.map((m) => [matchKey(m.eventSeason, m.eventCode, m.id), m])
        );

        if (includeScores) {
            for (const match of matches) {
                match.scores = [];
            }

            const scoreKeys = keys.map((k) => ({
                season: k.eventSeason,
                eventCode: k.eventCode!,
                matchId: k.id!,
            }));
            const scores = await MatchScore[season].find({ where: scoreKeys });

            for (const score of scores) {
                matchMap
                    .get(matchKey(score.season, score.eventCode, score.matchId))
                    ?.scores.push(score);
            }
        }

        if (includeTeams) {
            for (const match of matches) {
                match.teams = [];
            }

            const teamKeys = keys.map((k) => ({
                season: k.eventSeason,
                eventCode: k.eventCode!,
                matchId: k.id!,
            }));
            const teams = await TeamMatchParticipation.find({ where: teamKeys });

            for (const team of teams) {
                matchMap.get(matchKey(team.season, team.eventCode, team.matchId))?.teams.push(team);
            }
        }

        return matches;
    });
}
