import { calculateTeamEventStats, type Season } from "@ftc-scout/common";

type MatchLike = {
    id: number;
    season: number;
    eventCode: string;
    tournamentLevel: string;
    scores?: unknown;
    teams: { teamNumber: number; team?: unknown }[];
};

type EventLike = {
    season: number;
    code: string;
    remote: boolean;
    matches: MatchLike[];
    teams: { teamNumber: number; stats?: any; __typename?: string }[];
};

/** What a match adds to the team stats: its scores and who played them how. */
export function resultOf(match: MatchLike): string {
    return JSON.stringify([match.scores ?? null, match.teams]);
}

// With `recompute`, team stats are rebuilt from the matches so rankings move when a score posts.
// That is slow at a big event, so it's only done when a qualification match's result changed.
export function mergeMatches<E extends EventLike>(
    event: E,
    incoming: E["matches"],
    recompute: boolean
): E {
    if (!incoming.length) return event;

    let byId = new Map(event.matches.map((m) => [m.id, m]));
    let rescored = false;
    for (let m of incoming) {
        if (m.season != event.season || m.eventCode != event.code) continue;
        let old = byId.get(m.id);
        if (m.tournamentLevel == "Quals" && (old?.scores || m.scores)) {
            rescored ||= !old || resultOf(old) != resultOf(m);
        }
        byId.set(m.id, m);
    }
    let matches = [...byId.values()].sort((a, b) => a.id - b.id);

    if (!recompute) return { ...event, matches };

    let statsOf = new Map<number, ReturnType<typeof calculateTeamEventStats>[number]>();
    if (rescored) {
        let teamNumbers = new Set([
            ...event.teams.map((t) => t.teamNumber),
            ...matches.flatMap((m) => m.teams.map((t) => t.teamNumber)),
        ]);
        let computed = calculateTeamEventStats(
            event.season as Season,
            event.code,
            event.remote,
            matches.filter((m) => m.scores) as any,
            [...teamNumbers]
        );
        for (let s of computed) statsOf.set(s.teamNumber, s);
    }

    // Spread over the old stats to keep __typename and the fields we don't recompute.
    let statsFor = (teamNumber: number, old: any) => {
        let s = statsOf.get(teamNumber);
        // Null again if the team's only scored match was withdrawn.
        if (!s || !s.hasStats) return null;
        old ??= {};
        return {
            ...old,
            ...s,
            __typename: old.__typename,
            tot: { ...old.tot, ...s.tot },
            avg: { ...old.avg, ...s.avg },
            min: { ...old.min, ...s.min },
            max: { ...old.max, ...s.max },
            dev: { ...old.dev, ...s.dev },
            opr: { ...old.opr, ...s.opr },
        };
    };

    // Unchanged when no result changed, so the rankings aren't sorted again.
    let teams = rescored
        ? event.teams.map((t) => {
              let stats = statsFor(t.teamNumber, t.stats);
              return stats == null && t.stats == null ? t : { ...t, stats };
          })
        : event.teams;

    let known = new Set(event.teams.map((t) => t.teamNumber));
    for (let m of matches) {
        for (let t of m.teams) {
            if (known.has(t.teamNumber) || !t.team) continue;
            known.add(t.teamNumber);
            if (teams == event.teams) teams = [...teams]; // Copied before the first newcomer.
            teams.push({
                __typename: event.teams[0]?.__typename,
                season: event.season,
                eventCode: event.code,
                teamNumber: t.teamNumber,
                // Match teams don't include a location.
                team: { location: null, ...(t.team as object) },
                stats: statsFor(t.teamNumber, null),
            } as E["teams"][number]);
        }
    }

    return { ...event, matches, teams };
}
