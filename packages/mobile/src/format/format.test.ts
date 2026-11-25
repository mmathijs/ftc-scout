import { awardCategory, awardPlaceLabel, awardPlacementParts, sortAwardTypes } from "./awards";
import { prettyPrintDateRangeString, prettyPrintTimeString } from "./dates";

describe("dates", () => {
    it("prints one day once", () => {
        let s = prettyPrintDateRangeString("2025-12-06", "2025-12-06");
        expect(s).toContain("2025");
        expect(s).not.toContain("–");
    });

    it("prints a range with the year once when both ends share it", () => {
        let s = prettyPrintDateRangeString("2026-02-07", "2026-02-08", true);
        expect(s).toContain("–");
        expect(s.match(/2026/g)).toHaveLength(1);
    });

    it("prints both years across a new year", () => {
        let s = prettyPrintDateRangeString("2025-12-31", "2026-01-01");
        expect(s).toContain("2025");
        expect(s).toContain("2026");
    });

    it("does not use Intl's formatRange, which the phone's engine lacks", () => {
        let original = (Intl.DateTimeFormat.prototype as any).formatRange;
        (Intl.DateTimeFormat.prototype as any).formatRange = () => {
            throw new Error("formatRange is not available");
        };
        try {
            expect(() => prettyPrintDateRangeString("2026-02-07", "2026-02-08")).not.toThrow();
        } finally {
            (Intl.DateTimeFormat.prototype as any).formatRange = original;
        }
    });

    it("prints a time in the event's zone, and falls back for a zone it doesn't know", () => {
        let t = "2026-02-07T12:30:00.000Z";
        expect(prettyPrintTimeString(t, "Europe/Amsterdam")).toMatch(/1:30|13:30/);
        expect(() => prettyPrintTimeString(t, "Not/AZone")).not.toThrow();
    });
});

describe("awards", () => {
    it("names the places of an alliance by pick, as the website does", () => {
        expect(awardPlaceLabel("Winner", 1)).toBe("Captain");
        expect(awardPlaceLabel("Winner", 2)).toBe("1st pick");
        expect(awardPlaceLabel("Inspire", 2)).toBe("2nd");
        expect(awardPlaceLabel("DeansListFinalist", 1)).toBe("");
    });

    it("uses the leadership award's name from 2025", () => {
        expect(awardCategory("DeansListFinalist", 2024)).toBe("Dean's List Finalists");
        expect(awardCategory("DeansListFinalist", 2025)).toBe("FIRST Leadership Award Finalists");
        expect(awardPlacementParts("Reach", 1, null)).toEqual(["Reach Award", "Winner"]);
    });

    it("puts Inspire first", () => {
        expect((["Think", "Winner", "Inspire"] as const).slice().sort(sortAwardTypes)).toEqual([
            "Inspire",
            "Winner",
            "Think",
        ]);
    });
});
