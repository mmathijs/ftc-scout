import { DESCRIPTORS, type Season } from "@ftc-scout/common";
import type * as T from "@/api/generated/types";

export type MatchTeam = {
    teamNumber: number;
    alliance: T.Alliance;
    /** Captain, FirstPick, SecondPick in a playoff alliance. */
    allianceRole?: string | null;
    surrogate: boolean;
    noShow: boolean;
    dq: boolean;
    onField: boolean;
    team: { number: number; name: string };
};

export type MatchData = {
    id: number;
    season: number;
    eventCode: string;
    description: string;
    series: number;
    matchNum: number;
    tournamentLevel: T.TournamentLevel;
    scheduledStartTime?: string | null;
    actualStartTime?: string | null;
    scores?: any;
    teams: MatchTeam[];
};

export type Winner = "Red" | "Blue" | "Tie" | "Solo" | null;

export function computeWinner(scores: any): Winner {
    if (scores == undefined) return null;
    if (!("red" in scores)) return "Solo";
    if (scores.red.totalPoints > scores.blue.totalPoints) return "Red";
    if (scores.blue.totalPoints > scores.red.totalPoints) return "Blue";
    return "Tie";
}

// Three for a win and one for a tie, plus the bonus ranking points, as the website counts them.
export function rankingDots(match: MatchData): [number, number] | null {
    let s = match.scores;
    if (!s || !("red" in s) || match.tournamentLevel != "Quals") return null;
    let rps = DESCRIPTORS[match.season as Season]?.rankingPoints;
    if (!rps?.length) return null;
    let winner = computeWinner(s);
    let sum = (a: any) => rps!.reduce((acc, rp) => acc + (rp.id in a ? +a[rp.id] : 0), 0);
    let extra = (side: Winner) => (winner == side ? 3 : 0) + (winner == "Tie" ? 1 : 0);
    return [sum(s.red) + extra("Red"), sum(s.blue) + extra("Blue")];
}

// FIRST's number of playoff alliances for the number of teams playing, as on the website.
export function allianceCount(teamCount: number): number {
    if (teamCount <= 0) return 0;
    if (teamCount <= 10) return 2;
    if (teamCount <= 20) return 4;
    if (teamCount <= 40) return 6;
    return 8;
}

const BRACKETS = [2, 4, 6, 8, 16];

// The double elimination's size: FIRST's for the number of teams, or the smallest bracket that fits
// the alliances seen playing, since an event can choose a bigger one. A finals division has no teams
// to count (they played their qualification matches in the divisions), so it gets the latter.
function bracketSize(matches: MatchData[], teamCount: number, seen: number): number {
    // The 2025 European Premier Event's finals played its two divisions' 16 alliances.
    if (matches[0].season == 2025 && matches[0].eventCode == "FPEEUR") return 16;
    return Math.max(allianceCount(teamCount), BRACKETS.find((size) => size >= seen) ?? 16);
}

// Series where an alliance has already lost once, per bracket size (as in web's TradMatchRow, and
// the 2025 European Premier Event's for 16).
const LOST_BEFORE: Record<number, { both: number[]; blueOnly: number }> = {
    4: { both: [3, 5, 7], blueOnly: 6 },
    6: { both: [5, 6, 8, 9, 11], blueOnly: 10 },
    8: { both: [5, 6, 9, 10, 12, 13, 15], blueOnly: 14 },
    16: { both: [9, 10, 11, 12, 17, 18, 19, 20, 23, 24, 25, 26, 28, 29, 31], blueOnly: 30 },
};

const NEW_ROUND: Record<number, number[]> = {
    4: [3, 5, 6],
    6: [3, 5, 7, 9, 10],
    8: [5, 9, 11, 13, 14],
    16: [9, 13, 17, 21, 23, 25, 27, 28, 29, 30],
};

export type Hearts = { alreadyLost: boolean; lostThis: boolean };

export type LostBefore = { red: boolean; blue: boolean };

type Side = "Red" | "Blue";

// Who won: in the playoffs a disqualified alliance loses whatever it scored (unless both were), in
// qualification matches a disqualification only costs that team.
export function matchResult(match: MatchData): Winner {
    let winner = computeWinner(match.scores);
    if (match.tournamentLevel == "Quals" || winner == null || winner == "Solo") return winner;
    let dq = (a: Side) => match.teams.some((t) => t.alliance == a && t.dq);
    if (dq("Red") && !dq("Blue")) return "Blue";
    if (dq("Blue") && !dq("Red")) return "Red";
    return winner;
}

// A tie is no loss.
function lostMatch(match: MatchData, alliance: Side): boolean {
    return matchResult(match) == (alliance == "Red" ? "Blue" : "Red");
}

// Pass alliances = 0 when all the event's matches are known, since its bracket may not be FIRST's.
export function hearts(
    match: MatchData,
    alliances: number,
    lostEarlier?: LostBefore | null
): { red: Hearts; blue: Hearts } | null {
    if (match.tournamentLevel != "DoubleElim") return null;
    let table = LOST_BEFORE[alliances];
    let lost = (a: Side) =>
        (!!table &&
            (table.both.includes(match.series) ||
                (a == "Blue" && table.blueOnly == match.series))) ||
        (a == "Red" ? !!lostEarlier?.red : !!lostEarlier?.blue);
    return {
        red: { alreadyLost: lost("Red"), lostThis: lostMatch(match, "Red") },
        blue: { alreadyLost: lost("Blue"), lostThis: lostMatch(match, "Blue") },
    };
}

// Counted from the matches, not the bracket position, because events can choose their own bracket.
export function lostEarlier(matches: MatchData[]): {
    lost: Map<number, LostBefore>;
    alliances: number;
} {
    let lost = new Map<number, LostBefore>();
    let alliances: { teams: Set<number>; losses: number }[] = [];
    let playoffs = matches
        .filter((m) => m.tournamentLevel == "DoubleElim")
        .sort((a, b) => a.series - b.series || a.matchNum - b.matchNum);
    for (let match of playoffs) {
        let of = (side: Side) => {
            let teams = match.teams.filter((t) => t.alliance == side).map((t) => t.teamNumber);
            if (!teams.length) return null;
            let alliance = alliances.find((a) => teams.some((t) => a.teams.has(t)));
            if (!alliance) alliances.push((alliance = { teams: new Set(), losses: 0 }));
            for (let t of teams) alliance.teams.add(t);
            return alliance;
        };
        let red = of("Red");
        let blue = of("Blue");
        lost.set(match.id, { red: !!red?.losses, blue: !!blue?.losses });
        if (red && lostMatch(match, "Red")) red.losses++;
        if (blue && lostMatch(match, "Blue")) blue.losses++;
    }
    return { lost, alliances: alliances.length };
}

function isNewRound(match: MatchData, alliances: number): boolean {
    return (
        match.tournamentLevel == "DoubleElim" &&
        match.matchNum == 1 &&
        !!NEW_ROUND[alliances]?.includes(match.series)
    );
}

const BREAK_THRESHOLD_MS = 15 * 60 * 1000;
// A match still unplayed this long after the last one was skipped, not late.
const STALE_MS = 12 * 60 * 60 * 1000;

export function delays(sorted: MatchData[], now = Date.now()): Map<number, number> {
    let result = new Map<number, number>();
    let last = -1;
    let delayMs = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
        let m = sorted[i];
        if (m.scores && m.actualStartTime && m.scheduledStartTime) {
            last = i;
            delayMs =
                new Date(m.actualStartTime).getTime() - new Date(m.scheduledStartTime).getTime();
            break;
        }
    }
    if (last == -1) return result;
    if (now - new Date(sorted[last].actualStartTime!).getTime() > STALE_MS) return result;
    for (let i = last + 1; i < sorted.length; i++) {
        let prev = sorted[i - 1];
        let curr = sorted[i];
        if (curr.scheduledStartTime && prev.scheduledStartTime) {
            let gap =
                new Date(curr.scheduledStartTime).getTime() -
                new Date(prev.scheduledStartTime).getTime();
            if (gap > BREAK_THRESHOLD_MS) break;
        }
        if (!curr.scores) result.set(curr.id, delayMs);
    }
    return result;
}

export type MatchItem =
    /** `solo`: a remote event's table, one team to a match and no alliances. */
    | { kind: "mhead"; key: string; solo?: boolean }
    | { kind: "section"; key: string; title: string; solo?: boolean }
    | {
          kind: "match";
          key: string;
          match: MatchData;
          delayMs: number | null;
          zebra: boolean;
          /** Bracket size for the hearts (see `hearts`), or 0. */
          alliances: number;
          lostBefore: LostBefore | null;
          newRound: boolean;
          last: boolean;
      };

const LEVELS: [T.TournamentLevel, string][] = [
    ["DoubleElim", "Playoffs"],
    ["Finals", "Finals"],
    ["Semis", "Semifinals"],
    ["Quals", "Qualification Matches"],
];

export function isSolo(matches: MatchData[]): boolean {
    let teams = matches.flatMap((m) => m.teams);
    return teams.length > 0 && teams.every((t) => t.alliance == "Solo");
}

export function matchItems(
    matches: MatchData[],
    keyPrefix = "",
    teamCount?: number
): { items: MatchItem[]; delayMs: number | null } {
    let items: MatchItem[] = [];
    let activeDelay: number | null = null;
    if (!matches.length) return { items, delayMs: null };

    // Remote events list every match a team could have played; only show the ones with scores.
    let solo = isSolo(matches);
    if (solo) matches = matches.filter((m) => m.scores);
    if (!matches.length) return { items, delayMs: null };

    // Only a team's own match list reads the hearts off the bracket.
    let earlier = lostEarlier(matches);
    let alliances = bracketSize(
        matches,
        teamCount ?? new Set(matches.flatMap((m) => m.teams.map((t) => t.teamNumber))).size,
        earlier.alliances
    );
    // A level from a newer API than this app shows with the playoffs.
    let levelOf = (m: MatchData) =>
        LEVELS.some(([level]) => level == m.tournamentLevel) ? m.tournamentLevel : "DoubleElim";
    let levels = LEVELS.map(([level, title]) => ({
        title,
        matches: matches.filter((m) => levelOf(m) == level).sort((a, b) => a.id - b.id),
    })).filter((l) => l.matches.length);

    items.push({ kind: "mhead", key: `${keyPrefix}head`, solo });
    for (let level of levels) {
        items.push({
            kind: "section",
            key: `${keyPrefix}s-${level.title}`,
            title: level.title,
            solo,
        });
        let d = delays(level.matches);
        if (activeDelay == null && d.size) activeDelay = d.values().next().value ?? null;
        level.matches.forEach((match, i) =>
            items.push({
                kind: "match",
                key: `${keyPrefix}${match.eventCode}-${match.id}`,
                match,
                delayMs: d.get(match.id) ?? null,
                zebra: i % 2 == 1,
                alliances: teamCount == null ? 0 : alliances,
                lostBefore: earlier.lost.get(match.id) ?? null,
                newRound: isNewRound(match, alliances),
                last: false,
            })
        );
    }
    let last = items[items.length - 1];
    if (last.kind == "match") last.last = true;
    return { items, delayMs: activeDelay };
}

export function rpLabel(name: string): string {
    return name.replace(/\s*(ranking points?|rp)$/i, "").replace(/\s+(\d+)$/, "\n$1");
}
