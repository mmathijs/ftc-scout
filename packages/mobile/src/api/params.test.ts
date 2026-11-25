import { CURRENT_SEASON } from "@ftc-scout/common";
import { isSeason, isTeamNumber, seasonParam, teamNumberParam } from "./params";

describe("teamNumberParam", () => {
    it("reads a team number", () => {
        expect(teamNumberParam("3954")).toBe(3954);
        expect(teamNumberParam("1")).toBe(1);
        expect(teamNumberParam("999999999")).toBe(999999999);
    });

    it.each([
        "abc",
        "3954abc",
        "0x10",
        "1e3",
        "3954.5",
        "99999999999",
        "2147483648",
        "0",
        "-1",
        "03954",
        " 3954",
        "",
        "NaN",
        "Infinity",
    ])("is null for %p", (raw) => {
        expect(teamNumberParam(raw)).toBeNull();
    });

    it("is null for what is no text", () => {
        for (let raw of [undefined, null, 3954, ["3954"]]) expect(teamNumberParam(raw)).toBeNull();
    });
});

describe("seasonParam", () => {
    it("reads a season the app has", () => {
        expect(seasonParam("2019")).toBe(2019);
        expect(seasonParam(String(CURRENT_SEASON))).toBe(CURRENT_SEASON);
    });

    it.each(["abc", "1999", String(CURRENT_SEASON + 1), "2025.5", "0x7E9", "2e3", "", "02025"])(
        "is null for %p",
        (raw) => {
            expect(seasonParam(raw)).toBeNull();
        }
    );
});

describe("what the API is asked for", () => {
    it("is a whole team number within its Int, and a season that exists", () => {
        expect([3954, 1, 999_999_999].every(isTeamNumber)).toBe(true);
        expect([NaN, 0, -5, 3954.5, 99999999999, Infinity, "3954"].some(isTeamNumber)).toBe(false);
        expect(isSeason(2025)).toBe(true);
        expect([NaN, 1999, "2025", null].some(isSeason)).toBe(false);
    });
});
