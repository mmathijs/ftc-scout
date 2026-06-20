import { Season } from "@ftc-scout/common";
import { EntityManager, In } from "typeorm";
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

    const staleIds = dbMatches
        .filter((m) => !apiMatchIds.has(m.id) && !m.hasBeenPlayed)
        .map((m) => m.id);

    if (staleIds.length === 0) return;

    const withParticipation = new Set(
        (
            await em.find(TeamMatchParticipation, {
                where: { season, eventCode, matchId: In(staleIds) },
                select: { matchId: true },
            })
        ).map((r) => r.matchId)
    );

    const withScore = new Set(
        (
            await em.find(MatchScoreSchemas[season], {
                where: { season, eventCode, matchId: In(staleIds) },
                select: { matchId: true },
            })
        ).map((r) => r.matchId)
    );

    for (const id of staleIds) {
        if (!withParticipation.has(id) && !withScore.has(id)) {
            await em.delete(Match, { eventSeason: season, eventCode, id });
            console.info(`Deleted stale match ${season}/${eventCode}/${id}.`);
        }
    }
}
