import { Season } from "@ftc-scout/common";
import { EntityManager } from "typeorm";
import { Match } from "../entities/Match";
import { TeamMatchParticipation } from "../entities/TeamMatchParticipation";
import { MatchScoreSchemas } from "../entities/dyn/match-score";

export async function removeStaleMatches(
    em: EntityManager,
    season: Season,
    eventCode: string,
    apiMatchIds: Set<number>
) {
    if (apiMatchIds.size === 0) return;

    const dbMatches = await em.find(Match, {
        where: { eventSeason: season, eventCode },
        select: { id: true, hasBeenPlayed: true },
    });

    const staleMatches = dbMatches.filter((m) => !apiMatchIds.has(m.id));

    for (const { id, hasBeenPlayed } of staleMatches) {
        if (hasBeenPlayed) continue;

        const hasParticipation = await em.exists(TeamMatchParticipation, {
            where: { season, eventCode, matchId: id },
        });
        if (hasParticipation) continue;

        const hasScore = await em.exists(MatchScoreSchemas[season], {
            where: { season, eventCode, matchId: id },
        });
        if (hasScore) continue;

        await em.delete(Match, { eventSeason: season, eventCode, id });
        console.info(`Deleted stale match ${season}/${eventCode}/${id}.`);
    }
}
