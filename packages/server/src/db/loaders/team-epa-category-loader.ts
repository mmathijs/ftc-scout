import { Season } from "@ftc-scout/common";
import DataLoader from "dataloader";
import { In } from "typeorm";
import { DATA_SOURCE } from "../data-source";
import { TeamEpaCategory } from "../entities/TeamEpaCategory";
import { TeamEpaCategoryHistory } from "../entities/TeamEpaCategoryHistory";

export const teamEpaCategoryLoader = new DataLoader<string, TeamEpaCategory | null>(
    async (keys) => {
        let parsed = keys.map((k) => {
            let [season, teamNumber, category] = k.split(":");
            return { season: +season as Season, teamNumber: +teamNumber, category };
        });
        let seasons = [...new Set(parsed.map((p) => p.season))];
        let teamNumbers = [...new Set(parsed.map((p) => p.teamNumber))];
        let categories = [...new Set(parsed.map((p) => p.category))];

        let rows = await DATA_SOURCE.getRepository(TeamEpaCategory).find({
            where: { season: In(seasons), teamNumber: In(teamNumbers), category: In(categories) },
        });
        let byKey = new Map(rows.map((r) => [`${r.season}:${r.teamNumber}:${r.category}`, r]));

        return keys.map((k) => byKey.get(k) ?? null);
    },
    { cache: false }
);

export const teamEpaCategoryHistoryLoader = new DataLoader<string, TeamEpaCategoryHistory[]>(
    async (keys) => {
        let parsed = keys.map((k) => {
            let [season, teamNumber, category] = k.split(":");
            return { season: +season as Season, teamNumber: +teamNumber, category };
        });
        let seasons = [...new Set(parsed.map((p) => p.season))];
        let teamNumbers = [...new Set(parsed.map((p) => p.teamNumber))];
        let categories = [...new Set(parsed.map((p) => p.category))];

        let rows = await DATA_SOURCE.getRepository(TeamEpaCategoryHistory).find({
            where: { season: In(seasons), teamNumber: In(teamNumbers), category: In(categories) },
            order: { matchesPlayed: "ASC" },
        });
        let byKey = new Map<string, TeamEpaCategoryHistory[]>();
        for (let r of rows) {
            let k = `${r.season}:${r.teamNumber}:${r.category}`;
            if (!byKey.has(k)) byKey.set(k, []);
            byKey.get(k)!.push(r);
        }

        return keys.map((k) => byKey.get(k) ?? []);
    },
    { cache: false }
);

export type TeamEpaCategoryRank = { epa: number; matchesPlayed: number; rank: number };

export const teamEpaCategoryRankLoader = new DataLoader<string, TeamEpaCategoryRank | null>(
    async (keys) => {
        let parsed = keys.map((k) => {
            let [season, teamNumber, category] = k.split(":");
            return { season: +season as Season, teamNumber: +teamNumber, category };
        });
        let seasonCategoryPairs = [...new Set(parsed.map((p) => `${p.season}:${p.category}`))].map(
            (k) => {
                let [season, category] = k.split(":");
                return { season: +season as Season, category };
            }
        );

        let byKey = new Map<string, TeamEpaCategoryRank>();
        await Promise.all(
            seasonCategoryPairs.map(async ({ season, category }) => {
                let ranked = DATA_SOURCE.getRepository(TeamEpaCategory)
                    .createQueryBuilder("e")
                    .select("*")
                    .addSelect("rank() over (order by epa desc)", "rank")
                    .where("season = :season", { season })
                    .andWhere("category = :category", { category });

                let rows = await DATA_SOURCE.createQueryBuilder()
                    .addCommonTableExpression(ranked, "ranked")
                    .from("ranked", "ranked")
                    .select("*")
                    .getRawMany();

                for (let r of rows) {
                    byKey.set(`${season}:${+r.team_number}:${category}`, {
                        epa: +r.epa,
                        matchesPlayed: +r.matches_played,
                        rank: +r.rank,
                    });
                }
            })
        );

        return keys.map((k) => byKey.get(k) ?? null);
    },
    { cache: false }
);
