import {
    allianceCount,
    computeWinner,
    delays,
    hearts,
    lostEarlier,
    matchItems,
    matchResult,
    rankingDots,
    rpLabel,
    type MatchData,
} from "./model";

function match(id: number, over: Partial<MatchData> = {}): MatchData {
    return {
        id,
        season: 2025,
        eventCode: "TEST",
        description: `Q-${id}`,
        series: 0,
        matchNum: id,
        tournamentLevel: "Quals",
        teams: [],
        ...over,
    };
}

const at = (min: number) => new Date(Date.UTC(2026, 1, 7, 10, min)).toISOString();

describe("computeWinner", () => {
    it("names the higher score, a tie, a solo match and an unplayed one", () => {
        expect(computeWinner({ red: { totalPoints: 10 }, blue: { totalPoints: 5 } })).toBe("Red");
        expect(computeWinner({ red: { totalPoints: 5 }, blue: { totalPoints: 10 } })).toBe("Blue");
        expect(computeWinner({ red: { totalPoints: 5 }, blue: { totalPoints: 5 } })).toBe("Tie");
        expect(computeWinner({ totalPoints: 5 })).toBe("Solo");
        expect(computeWinner(null)).toBeNull();
    });
});

describe("matchResult", () => {
    const played = (level: MatchData["tournamentLevel"], redDq: boolean, blueDq = false) =>
        match(1, {
            tournamentLevel: level,
            teams: [
                { teamNumber: 1, alliance: "Red", dq: redDq },
                { teamNumber: 2, alliance: "Blue", dq: blueDq },
            ] as MatchData["teams"],
            scores: { red: { totalPoints: 100 }, blue: { totalPoints: 50 } },
        });

    it("gives a playoff match to the other alliance when one is disqualified", () => {
        expect(matchResult(played("DoubleElim", true))).toBe("Blue");
        expect(matchResult(played("DoubleElim", true, true))).toBe("Red");
        expect(hearts(played("DoubleElim", true), 0)!.red.lostThis).toBe(true);
    });

    it("leaves a qualification match to the higher score", () => {
        expect(matchResult(played("Quals", true))).toBe("Red");
    });
});

describe("delays", () => {
    it("carries the last played match's delay to those after it, up to a break", () => {
        let ms = [
            match(1, { scores: {}, scheduledStartTime: at(0), actualStartTime: at(6) }),
            match(2, { scheduledStartTime: at(8) }),
            match(3, { scheduledStartTime: at(16) }),
            match(4, { scheduledStartTime: at(60) }),
        ];
        let d = delays(ms, new Date(at(10)).getTime());
        expect(d.get(2)).toBe(6 * 60_000);
        expect(d.get(3)).toBe(6 * 60_000);
        expect(d.has(4)).toBe(false);
        expect(d.has(1)).toBe(false);
        expect(delays(ms, new Date(at(24 * 60)).getTime()).size).toBe(0);
    });

    it("is empty when nothing has been played", () => {
        expect(delays([match(1, { scheduledStartTime: at(0) })]).size).toBe(0);
    });
});

describe("rankingDots", () => {
    it("counts the bonus ranking points, three for the win and one for a tie", () => {
        let red = { totalPoints: 10, movementRp: true, goalRp: false, patternRp: true };
        let blue = { totalPoints: 5, movementRp: true, goalRp: false, patternRp: false };
        expect(rankingDots(match(1, { scores: { red, blue } }))).toEqual([5, 1]);
        expect(
            rankingDots(match(1, { scores: { red, blue: { ...blue, totalPoints: 10 } } }))
        ).toEqual([3, 2]);
        expect(
            rankingDots(match(1, { scores: { red, blue }, tournamentLevel: "DoubleElim" }))
        ).toBeNull();
    });
});

describe("hearts", () => {
    let playoff = (series: number, redPoints: number, bluePoints: number) =>
        match(20000 + series, {
            tournamentLevel: "DoubleElim",
            series,
            matchNum: 1,
            scores: { red: { totalPoints: redPoints }, blue: { totalPoints: bluePoints } },
        });

    it("gives both alliances two lives in the first round, the loser losing one", () => {
        expect(hearts(playoff(1, 10, 5), 4)).toEqual({
            red: { alreadyLost: false, lostThis: false },
            blue: { alreadyLost: false, lostThis: true },
        });
    });

    it("knows the lower bracket and the final of a four alliance bracket", () => {
        expect(hearts(playoff(3, 5, 10), 4)!.red).toEqual({ alreadyLost: true, lostThis: true });
        let final = hearts(playoff(6, 10, 5), 4)!;
        expect(final.red.alreadyLost).toBe(false);
        expect(final.blue.alreadyLost).toBe(true);
    });

    it("has none outside a double elimination", () => {
        expect(hearts(match(1), 4)).toBeNull();
    });
});

describe("matchItems", () => {
    it("puts the heading first, then playoffs before qualifications under their labels", () => {
        let { items } = matchItems([
            match(2),
            match(1),
            match(20001, { tournamentLevel: "DoubleElim", series: 1, matchNum: 1 }),
        ]);
        expect(
            items.map((i) =>
                i.kind == "section" ? i.title : i.kind == "match" ? i.match.id : i.kind
            )
        ).toEqual(["mhead", "Playoffs", 20001, "Qualification Matches", 1, 2]);
        let last = items[items.length - 1];
        expect(last.kind == "match" && last.last).toBe(true);
    });

    it("shows a level it doesn't know with the playoffs", () => {
        let level = "Swiss" as MatchData["tournamentLevel"];
        let { items } = matchItems([match(1), match(21001, { tournamentLevel: level })]);
        expect(items.map((i) => (i.kind == "section" ? i.title : i.kind))).toEqual([
            "mhead",
            "Playoffs",
            "match",
            "Qualification Matches",
            "match",
        ]);
    });

    it("is empty without matches: no heading over nothing", () => {
        expect(matchItems([]).items).toEqual([]);
    });
});

describe("rpLabel", () => {
    it("drops the words every ranking point ends in", () => {
        expect(rpLabel("Movement Ranking Point")).toBe("Movement");
        expect(rpLabel("Goal RP")).toBe("Goal");
    });

    it("puts a number at the end on its own line", () => {
        expect(rpLabel("Pollinator 1 Ranking Point")).toBe("Pollinator\n1");
        expect(rpLabel("Pollinator 2 Ranking Point")).toBe("Pollinator\n2");
    });
});

describe("a final between two alliances", () => {
    const team = (n: number, alliance: "Red" | "Blue") =>
        ({
            teamNumber: n,
            alliance,
            surrogate: false,
            noShow: false,
            dq: false,
            onField: true,
            team: { number: n, name: "" },
        } as MatchData["teams"][number]);
    const final = (id: number, red: number, blue: number, redTeams = [1, 2], blueTeams = [3, 4]) =>
        match(id, {
            tournamentLevel: "DoubleElim",
            series: 1,
            matchNum: id,
            teams: [
                ...redTeams.map((n) => team(n, "Red")),
                ...blueTeams.map((n) => team(n, "Blue")),
            ],
            scores: { red: { totalPoints: red }, blue: { totalPoints: blue } } as any,
        });

    it("shows the alliance that lost the first match as having lost before", () => {
        let { lost } = lostEarlier([final(1, 285, 423), final(2, 288, 450)]);
        expect(lost.get(1)).toEqual({ red: false, blue: false });
        expect(lost.get(2)).toEqual({ red: true, blue: false });
    });

    it("follows the teams when the alliances swap colours", () => {
        let { lost } = lostEarlier([final(1, 10, 20), final(2, 30, 5, [3, 4], [1, 2])]);
        expect(lost.get(2)).toEqual({ red: false, blue: true });
    });

    // 2025 BRCUOS had eight alliances at 19 teams, where FIRST's rule says four.
    // Alliance n is teams n1 and n2.
    describe("in a bracket bigger than FIRST's for the number of teams", () => {
        const pair = (n: number) => [n * 10 + 1, n * 10 + 2];
        const series = (s: number, red: number, blue: number, redPts: number, bluePts: number) =>
            match(20000 + s, {
                tournamentLevel: "DoubleElim",
                series: s,
                matchNum: 1,
                teams: [
                    ...pair(red).map((n) => team(n, "Red")),
                    ...pair(blue).map((n) => team(n, "Blue")),
                ],
                scores: { red: { totalPoints: redPts }, blue: { totalPoints: bluePts } } as any,
            });
        const all = [
            series(1, 1, 8, 200, 50),
            series(2, 4, 5, 100, 120),
            series(3, 2, 7, 206, 36),
            series(4, 3, 6, 90, 80),
            series(5, 8, 4, 60, 70),
            series(6, 7, 6, 10, 20),
            series(7, 1, 5, 150, 100),
        ];
        const rowHearts = (rows: ReturnType<typeof matchItems>["items"]) =>
            rows.flatMap((r) =>
                r.kind == "match" ? [hearts(r.match, r.alliances, r.lostBefore)!] : []
            );

        it("counts the losses from the matches for a whole event", () => {
            let { lost, alliances } = lostEarlier(all);
            expect(alliances).toBe(8);
            expect(lost.get(20003)).toEqual({ red: false, blue: false });
            expect(lost.get(20005)).toEqual({ red: true, blue: true });
            expect(lost.get(20007)).toEqual({ red: false, blue: false });

            let lives = rowHearts(matchItems(all).items);
            expect(lives.map((h) => [h.red.alreadyLost, h.blue.alreadyLost])).toEqual([
                [false, false],
                [false, false],
                [false, false],
                [false, false],
                [true, true],
                [true, true],
                [false, false],
            ]);
            // Series 3 here was between undefeated alliances, so its loser isn't out.
            expect(lives[2].blue).toEqual({ alreadyLost: false, lostThis: true });
        });

        it("draws the lines of the bracket that is played", () => {
            let rows = matchItems(all).items.flatMap((r) => (r.kind == "match" ? [r] : []));
            expect(rows.filter((r) => r.newRound).map((r) => r.match.series)).toEqual([5]);
        });

        it("still reads the bracket for a team's matches, which lack the others' losses", () => {
            // Alliance 5's matches only; its series 12 opponent lost earlier in a match not listed.
            let mine = [all[1], all[6], series(12, 5, 2, 10, 20)];
            let lives = rowHearts(matchItems(mine, "", 60).items);
            expect(lives[2].red.alreadyLost).toBe(true);
            expect(lives[2].blue.alreadyLost).toBe(true);
            expect(lives[1].blue.alreadyLost).toBe(false);
        });
    });

    it("is what the rows of a two-alliance table carry", () => {
        let { items } = matchItems([final(1, 285, 423), final(2, 288, 450)]);
        let rows = items.filter((i) => i.kind == "match");
        expect(rows.map((r) => r.kind == "match" && r.lostBefore)).toEqual([
            { red: false, blue: false },
            { red: true, blue: false },
        ]);
        let second = rows[1];
        if (second.kind != "match") throw new Error("not a match");
        expect(hearts(second.match, second.alliances, second.lostBefore)!.red).toEqual({
            alreadyLost: true,
            lostThis: true,
        });
    });
});

describe("a remote event's matches", () => {
    const solo = (id: number, scored: boolean) =>
        match(id, {
            teams: [
                {
                    teamNumber: 7,
                    alliance: "Solo",
                    surrogate: false,
                    noShow: !scored,
                    dq: false,
                    onField: true,
                    team: { number: 7, name: "" },
                },
            ] as MatchData["teams"],
            scores: scored ? ({ totalPoints: 100 } as any) : null,
        });

    it("lists only the matches a score was sent in for, under a team heading", () => {
        let { items } = matchItems([solo(1, true), solo(2, false), solo(3, true)]);
        expect(items[0]).toMatchObject({ kind: "mhead", solo: true });
        expect(items.filter((i) => i.kind == "match")).toHaveLength(2);
    });

    it("is empty when no score was sent in", () => {
        expect(matchItems([solo(1, false)]).items).toEqual([]);
    });
});

describe("a team's own playoff matches", () => {
    // Alliance n is teams n1 and n2.
    const team = (n: number, alliance: "Red" | "Blue") =>
        ({
            teamNumber: n,
            alliance,
            surrogate: false,
            noShow: false,
            dq: false,
            onField: true,
            team: { number: n, name: "" },
        } as MatchData["teams"][number]);
    const series = (s: number, red: number, blue: number, redWins: boolean, eventCode = "TEST") =>
        match(20000 + s, {
            eventCode,
            tournamentLevel: "DoubleElim",
            series: s,
            matchNum: 1,
            teams: [red * 10 + 1, red * 10 + 2, blue * 10 + 1, blue * 10 + 2].map((n, i) =>
                team(n, i < 2 ? "Red" : "Blue")
            ),
            scores: {
                red: { totalPoints: redWins ? 100 : 50 },
                blue: { totalPoints: redWins ? 50 : 100 },
            },
        });
    const alreadyLost = (matches: MatchData[], teamCount: number) =>
        matchItems(matches, "", teamCount).items.flatMap((r) => {
            if (r.kind != "match") return [];
            let h = hearts(r.match, r.alliances, r.lostBefore)!;
            return [[h.red.alreadyLost, h.blue.alreadyLost]];
        });

    it("has at most FIRST's eight alliances", () => {
        expect([10, 11, 20, 21, 40, 41, 81, 200].map(allianceCount)).toEqual([
            2, 4, 4, 6, 6, 8, 8, 8,
        ]);
    });

    it("reads the eight-alliance bracket at an event of more than 80 teams", () => {
        // Alliance 2 wins the upper bracket to its final; alliance 8 drops to the lower one.
        let upper = [series(2, 2, 7, true), series(7, 2, 3, true), series(11, 2, 1, true)];
        expect(alreadyLost(upper, 100)).toEqual([
            [false, false],
            [false, false],
            [false, false],
        ]);
        let lower = [series(1, 1, 8, true), series(5, 8, 4, true)];
        expect(alreadyLost(lower, 100)[1]).toEqual([true, true]);
    });

    it("reads the 16-alliance bracket of the 2025 European Premier Event", () => {
        expect(alreadyLost([series(17, 1, 2, true, "FPEEUR")], 0)).toEqual([[true, true]]);
    });

    it("reads the smallest bracket that fits when no team played qualification matches there", () => {
        // A finals division, whose teams played their qualification matches in the divisions:
        // three alliances seen make a four-alliance bracket, whose series 3 is between losers.
        let mine = [series(1, 1, 2, false), series(3, 1, 3, true)];
        expect(alreadyLost(mine, 0)).toEqual([
            [false, false],
            [true, true],
        ]);
    });
});
