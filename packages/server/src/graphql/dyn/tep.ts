import {
    DESCRIPTORS,
    Descriptor,
    FloatTy,
    IntTy,
    Season,
    nn,
    notEmpty,
    nullTy,
} from "@ftc-scout/common";
import { GraphQLFieldConfig, GraphQLObjectType } from "graphql";
import { TeamEventParticipation } from "../../db/entities/dyn/team-event-participation";
import { LeagueRanking } from "../../db/entities/dyn/league-ranking";
import { teamEpaLoader, teamEpaHistoryLoader } from "../../db/loaders/team-epa-loader";
import {
    teamEpaCategoryLoader,
    teamEpaCategoryHistoryLoader,
} from "../../db/loaders/team-epa-category-loader";

type TepLike = (TeamEventParticipation | LeagueRanking) & {
    season: Season;
    isRemote: boolean;
};

const EPA_CATEGORY_SHORT_NAMES: Record<string, string> = {
    autoPoints: "auto",
    dcPoints: "dc",
    egPoints: "eg",
};

function epaCategoryField(category: string): GraphQLFieldConfig<any, any> {
    return {
        ...nullTy(FloatTy),
        resolve: async (tep: TepLike) => {
            if (!("eventCode" in tep)) {
                return (
                    (
                        await teamEpaCategoryLoader.load(
                            `${tep.season}:${tep.teamNumber}:${category}`
                        )
                    )?.epa ?? null
                );
            }
            let hist = await teamEpaCategoryHistoryLoader.load(
                `${tep.season}:${tep.teamNumber}:${category}`
            );
            let atEvent = hist.filter((h) => h.eventCode == tep.eventCode);
            return atEvent.length > 0 ? atEvent[atEvent.length - 1].epa : null;
        },
    };
}

function totalEpaField(): GraphQLFieldConfig<any, any> {
    return {
        ...FloatTy,
        resolve: async (tep: TepLike) => {
            if (!("eventCode" in tep)) {
                return (await teamEpaLoader.load(`${tep.season}:${tep.teamNumber}`))?.epa ?? null;
            }
            let hist = await teamEpaHistoryLoader.load(`${tep.season}:${tep.teamNumber}`);
            let atEvent = hist.filter((h) => h.eventCode == tep.eventCode);
            return atEvent.length > 0 ? atEvent[atEvent.length - 1].epa : null;
        },
    };
}

export function makeTepTypes(descriptor: Descriptor): GraphQLObjectType[] {
    let l = [make(descriptor, false), descriptor.hasRemote ? make(descriptor, true) : null];
    return l.filter(notEmpty);
}

export function addTypename<T extends TepLike>(tep: T): T {
    let suffix = DESCRIPTORS[tep.season].typeSuffix(tep.isRemote);
    let __typename = `TeamEventStats${tep.season}${suffix}`;
    return { ...tep, __typename };
}

function make(descriptor: Descriptor, remote: boolean): GraphQLObjectType {
    let nameSuffix = descriptor.typeSuffix(remote);

    let innerFields = {} as Record<string, GraphQLFieldConfig<any, any>>;

    for (let c of descriptor.tepColumns()) {
        if (c.tradOnly && remote) continue;

        innerFields[c.apiName] = FloatTy;
    }

    let inner = new GraphQLObjectType({
        name: `TeamEventStats${descriptor.season}${nameSuffix}Group`,
        fields: innerFields,
    });

    let epaGroupFields = {} as Record<string, GraphQLFieldConfig<any, any>>;
    for (let c of descriptor.epaColumns()) {
        epaGroupFields[c.dbName == "totalPoints" ? "total" : EPA_CATEGORY_SHORT_NAMES[c.dbName]] =
            c.dbName == "totalPoints"
                ? totalEpaField()
                : epaCategoryField(EPA_CATEGORY_SHORT_NAMES[c.dbName]);
    }
    epaGroupFields["np"] = epaCategoryField("np");

    let epaGroupInner = new GraphQLObjectType({
        name: `TeamEventStats${descriptor.season}${nameSuffix}EpaGroup`,
        fields: epaGroupFields,
    });

    let hasTb2 = descriptor.rankings.tb != "LosingScore";

    let outer = new GraphQLObjectType({
        name: `TeamEventStats${descriptor.season}${nameSuffix}`,
        fields: {
            rank: IntTy,
            rp: FloatTy,
            tb1: FloatTy,
            ...(hasTb2 ? { tb2: FloatTy } : {}),
            ...(!remote ? { wins: IntTy, losses: IntTy, ties: IntTy, dqs: IntTy } : {}),
            qualMatchesPlayed: IntTy,
            tot: { type: nn(inner) },
            avg: { type: nn(inner) },
            min: { type: nn(inner) },
            max: { type: nn(inner) },
            dev: { type: nn(inner) },
            opr: { type: nn(inner) },
            epaGroup: { type: nn(epaGroupInner), resolve: (tep: TepLike) => tep },
            epa: totalEpaField(),
        },
    });

    return outer;
}
