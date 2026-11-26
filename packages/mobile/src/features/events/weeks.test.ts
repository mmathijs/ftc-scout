import { BEFORE_KICKOFF, groupByWeek, firstMonday } from "./weeks";

describe("groupByWeek", () => {
    it("starts weeks on the Monday of kickoff week", () => {
        expect(firstMonday(2025).getDay()).toBe(1);
    });

    it("puts a heading before each week's events", () => {
        let monday = firstMonday(2025);
        let day = (n: number) => {
            let d = new Date(monday);
            d.setDate(d.getDate() + n);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
                d.getDate()
            ).padStart(2, "0")}`;
        };
        let events = [
            { season: 2025, code: "A", start: day(5) },
            { season: 2025, code: "B", start: day(6) },
            { season: 2025, code: "C", start: day(21) },
        ];
        let items = groupByWeek(events, 2025);
        expect(items.map((i) => (i.kind == "week" ? `week ${i.week}` : i.event.code))).toEqual([
            "week 0",
            "A",
            "B",
            "week 3",
            "C",
        ]);
    });
});

// CI also runs these west and east of UTC via TZ.
describe("weeks in the season's calendar", () => {
    let weekOf = (start: string, season: 2024 | 2026 = 2026) => {
        let items = groupByWeek([{ season, code: "X", start }], season);
        let w = items[0];
        if (w.kind != "week") throw new Error("no heading");
        return w;
    };
    let ymd = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
            d.getDate()
        ).padStart(2, "0")}`;

    it("starts 2026 on Monday 7 September, the Monday before the Saturday kickoff", () => {
        expect(ymd(firstMonday(2026))).toBe("2026-09-07");
        expect(firstMonday(2026).getHours()).toBe(0);
    });

    it("puts an event that starts on a Monday in the week that starts that day", () => {
        for (let [start, week] of [
            ["2026-09-13", 0],
            ["2026-09-14", 1],
            ["2026-11-02", 8],
            ["2026-11-16", 10],
            ["2027-03-15", 27],
        ] as const) {
            let w = weekOf(start);
            expect([start, w.week]).toEqual([start, week]);
            expect(ymd(w.start) <= start && start <= ymd(w.end)).toBe(true);
        }
    });

    it("gathers the events before kickoff week under one heading, not a negative week", () => {
        let items = groupByWeek(
            [
                { season: 2024, code: "A", start: "2024-02-03" },
                { season: 2024, code: "B", start: "2024-08-20" },
                { season: 2024, code: "C", start: "2024-09-27" },
            ],
            2024
        );
        let heads = items.filter((i) => i.kind == "week");
        expect(heads.map((h) => h.kind == "week" && h.week)).toEqual([BEFORE_KICKOFF, 3]);
        let first = heads[0];
        if (first.kind != "week") throw new Error("no heading");
        expect([ymd(first.start), ymd(first.end)]).toEqual(["2024-02-03", "2024-08-20"]);
    });
});
