import { GraphQLObjectType } from "graphql";
import { DateTimeTy, IntTy, StrTy } from "@ftc-scout/common";
import { TeamAvatar } from "../../db/entities/TeamAvatar";
import { In } from "typeorm";

export const TeamAvatarGQL: GraphQLObjectType = new GraphQLObjectType({
    name: "TeamAvatar",
    fields: () => ({
        teamNumber: IntTy,
        season: IntTy,
        uuid: StrTy,
        url: StrTy,
        createdAt: DateTimeTy,
    }),
});

export function avatarHistoryLoader(teamNumbers: number[]): Promise<TeamAvatar[]> {
    if (teamNumbers.length == 0) return Promise.resolve([]);

    return TeamAvatar.find({
        where: { teamNumber: In(teamNumbers) },
        order: { id: "DESC" },
    });
}
