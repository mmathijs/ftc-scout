import { GraphQLEnumType, GraphQLObjectType } from "graphql";
import { DateTimeTy, StrTy, nn, BoolTy } from "@ftc-scout/common";
import { VideoSource } from "../../db/entities/Video";

export const VideoSourceGQL = new GraphQLEnumType({
    name: "VideoSource",
    values: {
        FTCEvents: { value: VideoSource.FTCEvents },
        ClipFarm: { value: VideoSource.ClipFarm },
    },
});

export const VideoGQL: GraphQLObjectType = new GraphQLObjectType({
    name: "Video",
    fields: () => ({
        url: StrTy,
        title: StrTy,
        source: { type: nn(VideoSourceGQL) },
        official: BoolTy,
        createdAt: DateTimeTy,
        updatedAt: DateTimeTy,
    }),
});
