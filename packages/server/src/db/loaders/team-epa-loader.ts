import { Season } from "@ftc-scout/common";
import DataLoader from "dataloader";
import { In } from "typeorm";
import { DATA_SOURCE } from "../data-source";
import { TeamEpa } from "../entities/TeamEpa";
import { TeamEpaHistory } from "../entities/TeamEpaHistory";

export const teamEpaLoader = new DataLoader<string, TeamEpa | null>(
    async (keys) => {
        let parsed = keys.map((k) => {
            let [season, teamNumber] = k.split(":");
            return { season: +season as Season, teamNumber: +teamNumber };
        });
        let seasons = [...new Set(parsed.map((p) => p.season))];
        let teamNumbers = [...new Set(parsed.map((p) => p.teamNumber))];

        let rows = await DATA_SOURCE.getRepository(TeamEpa).find({
            where: { season: In(seasons), teamNumber: In(teamNumbers) },
        });
        let byKey = new Map(rows.map((r) => [`${r.season}:${r.teamNumber}`, r]));

        return keys.map((k) => byKey.get(k) ?? null);
    },
    { cache: false }
);

export const teamEpaHistoryLoader = new DataLoader<string, TeamEpaHistory[]>(
    async (keys) => {
        let parsed = keys.map((k) => {
            let [season, teamNumber] = k.split(":");
            return { season: +season as Season, teamNumber: +teamNumber };
        });
        let seasons = [...new Set(parsed.map((p) => p.season))];
        let teamNumbers = [...new Set(parsed.map((p) => p.teamNumber))];

        let rows = await DATA_SOURCE.getRepository(TeamEpaHistory).find({
            where: { season: In(seasons), teamNumber: In(teamNumbers) },
            order: { matchesPlayed: "ASC" },
        });
        let byKey = new Map<string, TeamEpaHistory[]>();
        for (let r of rows) {
            let k = `${r.season}:${r.teamNumber}`;
            if (!byKey.has(k)) byKey.set(k, []);
            byKey.get(k)!.push(r);
        }

        return keys.map((k) => byKey.get(k) ?? []);
    },
    { cache: false }
);

export type TeamEpaRank = { epa: number; matchesPlayed: number; rank: number };

export const teamEpaRankLoader = new DataLoader<string, TeamEpaRank | null>(
    async (keys) => {
        let parsed = keys.map((k) => {
            let [season, teamNumber] = k.split(":");
            return { season: +season as Season, teamNumber: +teamNumber };
        });
        let seasons = [...new Set(parsed.map((p) => p.season))];

        let byKey = new Map<string, TeamEpaRank>();
        await Promise.all(
            seasons.map(async (season) => {
                let ranked = DATA_SOURCE.getRepository(TeamEpa)
                    .createQueryBuilder("e")
                    .select("*")
                    .addSelect("rank() over (order by epa desc)", "rank")
                    .where("season = :season", { season });

                let rows = await DATA_SOURCE.createQueryBuilder()
                    .addCommonTableExpression(ranked, "ranked")
                    .from("ranked", "ranked")
                    .select("*")
                    .getRawMany();

                for (let r of rows) {
                    byKey.set(`${season}:${+r.team_number}`, {
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
