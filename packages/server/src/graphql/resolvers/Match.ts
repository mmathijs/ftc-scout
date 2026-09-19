import { GraphQLObjectType, GraphQLResolveInfo } from "graphql";
import { dataLoaderResolverSingle, keyListToWhereClause } from "../utils";
import {
    Alliance,
    BoolTy,
    DateTimeTy,
    FloatTy,
    IntTy,
    StrTy,
    list,
    nn,
    nullTy,
    predictMatch,
} from "@ftc-scout/common";
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
import { teamEpaLoader, teamEpaHistoryLoader } from "../../db/loaders/team-epa-loader";

const EpaPredictionGQL = new GraphQLObjectType({
    name: "EpaPrediction",
    fields: {
        redScore: FloatTy,
        blueScore: FloatTy,
        redWinProb: FloatTy,
        redSigma: FloatTy,
        blueSigma: FloatTy,
    },
});

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

        epaPrediction: {
            type: EpaPredictionGQL,
            resolve: async (m: Match) => {
                let teams = (m.teams ?? []).filter(
                    (t) =>
                        !t.surrogate && (t.alliance == Alliance.Red || t.alliance == Alliance.Blue)
                );
                let redTeams = teams.filter((t) => t.alliance == Alliance.Red);
                let blueTeams = teams.filter((t) => t.alliance == Alliance.Blue);
                if (redTeams.length != 2 || blueTeams.length != 2) return null;
                let allTeams = [...redTeams, ...blueTeams];

                let liveRows = await Promise.all(
                    allTeams.map((t) => teamEpaLoader.load(`${m.eventSeason}:${t.teamNumber}`))
                );
                let fitSource = liveRows.find((r) => r != null);
                if (!fitSource) return null;
                let fit =
                    fitSource.fitA != null && fitSource.fitB != null
                        ? { a: fitSource.fitA, b: fitSource.fitB }
                        : null;

                let epaInputs: ({ epa: number } | null)[];

                // If is played use epa before that match
                if (m.hasBeenPlayed) {
                    let histories = await Promise.all(
                        allTeams.map((t) =>
                            teamEpaHistoryLoader.load(`${m.eventSeason}:${t.teamNumber}`)
                        )
                    );
                    let matchTime = m.actualStartTime ?? m.scheduledStartTime ?? m.postResultTime;
                    epaInputs = histories.map((hist) => {
                        let sameMatch = hist.filter(
                            (h) => h.eventCode == m.eventCode && h.matchId == m.id
                        );
                        let thisEntry = sameMatch[sameMatch.length - 1];
                        if (thisEntry) {
                            return (
                                hist.find((h) => h.matchesPlayed == thisEntry.matchesPlayed - 1) ??
                                null
                            );
                        }

                        let beforeThisMatch =
                            matchTime == null
                                ? hist.filter((h) => h.eventCode == m.eventCode)
                                : hist.filter(
                                      (h) => h.matchTime != null && h.matchTime < matchTime!
                                  );
                        return beforeThisMatch.length > 0
                            ? beforeThisMatch[beforeThisMatch.length - 1]
                            : null;
                    });
                } else {
                    // if not yet played, use current EPA
                    epaInputs = liveRows;
                }

                let [r1, r2, b1, b2] = epaInputs;
                if (!r1 || !r2 || !b1 || !b2) return null;

                return predictMatch([r1, r2], [b1, b2], fit);
            },
        },

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
    includeTeams ||= info.some(
        (i) => "teams" in graphqlFields(i) || "epaPrediction" in graphqlFields(i)
    );
    includeVideos ||= info.some((i) => "videos" in graphqlFields(i));
    let season = keys[0].eventSeason as Season;

    let q = DATA_SOURCE.getRepository(Match)
        .createQueryBuilder("m")
        .where(keyListToWhereClause("m", keys));

    if (includeVideos) {
        q.leftJoinAndMapMany(
            "m.videos",
            "video",
            "v",
            "m.event_season = v.event_season AND m.event_code = v.event_code AND m.id = v.match_id"
        );
    }

    q.addOrderBy("m.id", "ASC");

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
