import { GraphQLFieldResolver, GraphQLObjectType } from "graphql";
import { BoolTy, IntTy, Season, StrTy, list, nn, nullTy } from "@ftc-scout/common";
import { In } from "typeorm";
import { EventPitMap, PitMapData } from "../../db/entities/EventPitMap";
import { Event } from "../../db/entities/Event";
import { dataLoaderResolverSingle } from "../utils";
import { GQLContext } from "../context";

export const PitMapTeamGQL = new GraphQLObjectType({
    name: "PitMapTeam",
    fields: {
        number: StrTy,
        name: nullTy(StrTy),
        displayNumber: nullTy(StrTy),
    },
});

export const PitMapElementGQL = new GraphQLObjectType({
    name: "PitMapElement",
    fields: {
        type: StrTy,
        x: IntTy,
        y: IntTy,
        width: IntTy,
        height: IntTy,
        label: nullTy(StrTy),
        labelOrientation: nullTy(StrTy),
        index: nullTy(IntTy),
        team: { type: PitMapTeamGQL },
        address: nullTy(StrTy),
        addressGroup: nullTy(StrTy),
        color: nullTy(StrTy),
    },
});

export const PitMapGQL = new GraphQLObjectType({
    name: "PitMap",
    fields: {
        minX: IntTy,
        minY: IntTy,
        width: IntTy,
        height: IntTy,
        showPitNumbers: BoolTy,
        showPitAddresses: BoolTy,
        elements: { type: list(nn(PitMapElementGQL)) },
        updatedAt: StrTy,
    },
});

type Key = { season: Season; eventCode: string };

const pitMapLoader = dataLoaderResolverSingle<
    Event,
    (PitMapData & { updatedAt: string }) | null,
    Key,
    {},
    any
>(
    (e) => ({ season: e.season, eventCode: e.code }),
    async (keys) => {
        let rows = await EventPitMap.find({
            where: keys.map((k) => ({ season: k.season, eventCode: k.eventCode })),
        });
        return rows.map((r) => ({
            season: r.season,
            eventCode: r.eventCode,
            ...r.data,
            updatedAt: r.updatedAt.toISOString(),
        }));
    },
    (k, r) => r.season == k.season && r.eventCode == k.eventCode
);

// Only selects the keys so the tab can be shown without loading the map.
const hasPitMapLoader = dataLoaderResolverSingle<Event, boolean, Key, {}, any>(
    (e) => ({ season: e.season, eventCode: e.code }),
    async (keys) => {
        let seasons = [...new Set(keys.map((k) => k.season))];
        let codes = [...new Set(keys.map((k) => k.eventCode))];
        return EventPitMap.find({
            select: { season: true, eventCode: true },
            where: { season: In(seasons), eventCode: In(codes) },
        });
    },
    (k, r) => r.season == k.season && r.eventCode == k.eventCode
);

export const pitMapResolver: GraphQLFieldResolver<Event, GQLContext> = pitMapLoader;
export const hasPitMapResolver: GraphQLFieldResolver<Event, GQLContext> = async (e, a, c, i) =>
    !!(await hasPitMapLoader(e, a, c, i));
