import { mergeMatches } from "./mergeMatches";
import qualifier from "./__fixtures__/qualifier.json";
import remote from "./__fixtures__/remote.json";

// Real events with the stats the server computed from their matches: a qualifier (2025 NLTHQ) and
// a remote tournament (2021 USIAICLT, where one team sent in no scores).
const event = qualifier as any;
const remoteEvent = remote as any;

// Takes a scored match's score away and spoils its teams' stats, then merges it back.
function rescore(ev: any, match: any) {
    let playing = match.teams.map((t: any) => t.teamNumber);
    let before = {
        ...ev,
        matches: ev.matches.map((m: any) => (m.id == match.id ? { ...m, scores: null } : m)),
        teams: ev.teams.map((t: any) =>
            playing.includes(t.teamNumber) ? { ...t, stats: { ...t.stats, rank: -1, rp: -1 } } : t
        ),
    };
    return mergeMatches(before, [match], true);
}

const serverStats = (ev: any, teamNumber: number) =>
    ev.teams.find((t: any) => t.teamNumber == teamNumber).stats;

describe("mergeMatches", () => {
    it("adds new matches, replaces known ones and keeps them in order", () => {
        let last = event.matches[event.matches.length - 1];
        let before = { ...event, matches: event.matches.slice(0, -1) };
        let changed = { ...event.matches[0], scheduledStartTime: "2030-01-01T00:00:00.000Z" };

        let merged = mergeMatches(before, [last, changed], false);
        expect(merged.matches.map((m: any) => m.id)).toEqual(event.matches.map((m: any) => m.id));
        expect(merged.matches[0].scheduledStartTime).toBe("2030-01-01T00:00:00.000Z");
        expect(merged.teams).toBe(before.teams);
    });

    it("ignores matches of another event", () => {
        let other = { ...event.matches[0], eventCode: "OTHER", id: 999 };
        expect(mergeMatches(event, [other], false).matches).toHaveLength(event.matches.length);
    });

    it("recomputes the teams' stats to what the server has once the last score arrives", () => {
        let merged = rescore(event, event.matches[event.matches.length - 1]);

        for (let team of merged.teams as any[]) {
            let server = serverStats(event, team.teamNumber);
            if (!server) {
                expect(team.stats).toBeNull();
                continue;
            }
            expect([team.teamNumber, team.stats.wins, team.stats.losses, team.stats.ties]).toEqual([
                team.teamNumber,
                server.wins,
                server.losses,
                server.ties,
            ]);
            expect(team.stats.rank).toBe(server.rank);
            expect(team.stats.rp).toBeCloseTo(server.rp, 6);
            expect(team.stats.avg.totalPointsNp).toBeCloseTo(server.avg.totalPointsNp, 6);
            expect(team.stats.opr.totalPointsNp).toBeCloseTo(server.opr.totalPointsNp, 4);
            expect(team.stats.__typename).toBe(server.__typename);
            expect(team.team).toBeDefined();
        }
    });

    it("takes a team's stats away when its only scored match is withdrawn", () => {
        let first = event.matches[0];
        let playing = first.teams.map((t: any) => t.teamNumber);
        let empty = {
            ...event,
            matches: [],
            teams: event.teams.map((t: any) => ({ ...t, stats: null })),
        };

        let scored = mergeMatches(empty, [first], true);
        for (let t of scored.teams as any[]) {
            expect([t.teamNumber, t.stats != null]).toEqual([
                t.teamNumber,
                playing.includes(t.teamNumber),
            ]);
        }

        let withdrawn = mergeMatches(scored, [{ ...first, scores: null }], true);
        expect(withdrawn.matches).toHaveLength(1);
        expect((withdrawn.teams as any[]).filter((t) => t.stats != null)).toEqual([]);
    });

    it("adds a team that is only in a new match", () => {
        let first = event.matches[0];
        let newcomer = {
            ...first.teams[0],
            teamNumber: 99999,
            team: { number: 99999, name: "Late Entry", __typename: "Team" },
        };
        let match = { ...first, id: 9001, teams: [newcomer, ...first.teams.slice(1)] };

        let merged = mergeMatches(event, [match], true);
        expect(merged.teams).toHaveLength(event.teams.length + 1);
        let added = (merged.teams as any[]).find((t) => t.teamNumber == 99999);
        expect(added).toMatchObject({
            __typename: "TeamEventParticipation",
            season: event.season,
            eventCode: event.code,
            team: { number: 99999, name: "Late Entry", location: null },
        });
        expect(added.stats.qualMatchesPlayed).toBe(1);

        let again = mergeMatches(merged, [{ ...match, scores: null }], true);
        expect(again.teams).toHaveLength(event.teams.length + 1);
        expect((again.teams as any[]).find((t) => t.teamNumber == 99999).stats).toBeNull();
    });

    it("leaves the rankings alone when a playoff match is scored", () => {
        let q = event.matches[0];
        let playoff = {
            ...q,
            id: 20001,
            tournamentLevel: "DoubleElim",
            series: 1,
            description: "M-1",
            scores: { ...q.scores, red: q.scores.blue, blue: q.scores.red },
        };

        let merged = mergeMatches(event, [playoff], true);
        expect(merged.matches[merged.matches.length - 1].id).toBe(20001);
        for (let team of merged.teams as any[]) {
            let server = serverStats(event, team.teamNumber);
            expect([
                team.teamNumber,
                team.stats?.rank,
                team.stats?.wins,
                team.stats?.losses,
            ]).toEqual([team.teamNumber, server?.rank, server?.wins, server?.losses]);
        }
    });

    it("only recomputes the stats when a qualification match's result changes", () => {
        let q = event.matches[0];
        let playoff = { ...q, id: 20001, tournamentLevel: "DoubleElim" };
        expect(mergeMatches(event, [playoff], true).teams).toBe(event.teams);
        let again = { ...q, videos: [{ url: "https://example.com/v", title: null }] };
        expect(mergeMatches(event, [again], true).teams).toBe(event.teams);
        let rescored = { ...q, scores: { ...q.scores, red: q.scores.blue, blue: q.scores.red } };
        expect(mergeMatches(event, [rescored], true).teams).not.toBe(event.teams);
    });

    it("recomputes a remote event's stats to what the server has", () => {
        let scored = remoteEvent.matches.filter((m: any) => m.scores);
        let merged = rescore(remoteEvent, scored[scored.length - 1]);

        for (let team of merged.teams as any[]) {
            let server = serverStats(remoteEvent, team.teamNumber);
            if (!server) {
                expect(team.stats).toBeNull();
                continue;
            }
            expect([team.teamNumber, team.stats.rank, team.stats.qualMatchesPlayed]).toEqual([
                team.teamNumber,
                server.rank,
                server.qualMatchesPlayed,
            ]);
            expect(team.stats.rp).toBeCloseTo(server.rp, 6);
            expect(team.stats.tb1).toBeCloseTo(server.tb1, 6);
            expect(team.stats.avg.totalPoints).toBeCloseTo(server.avg.totalPoints, 6);
            expect(team.stats.max.totalPoints).toBe(server.max.totalPoints);
        }
        expect((merged.teams as any[]).filter((t) => t.stats).length).toBe(3);
    });
});
