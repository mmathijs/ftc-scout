import { highlightParts, search } from "./search";

const team = (number: number, name: string) =>
    ({
        __typename: "Team",
        number,
        name,
        location: { city: "", state: "", country: "" },
    } as any);
const event = (code: string, name: string) =>
    ({
        __typename: "Event",
        season: 2025,
        code,
        name,
        start: "2026-01-01",
        end: "2026-01-01",
        type: "Qualifier",
        remote: false,
        hasMatches: true,
    } as any);

const teams = [
    team(16461, "Infinite Turtles"),
    team(164, "Robo Kings"),
    team(3954, "Pink to the Future"),
    team(1646, "Precision Guessworks"),
];
const events = [
    event("NLCMP", "Benelux Championship"),
    event("USNCCMP", "North Carolina Championship"),
];

describe("search", () => {
    it("treats digits as the start of a team number, lowest first", () => {
        expect(search("164", events, teams).map((r: any) => r.document.number)).toEqual([
            164, 1646, 16461,
        ]);
    });

    it("finds a team by a loosely typed name", () => {
        let res = search("infinte turtle", events, teams);
        expect((res[0].document as any).number).toBe(16461);
    });

    it("finds an event by its name and by its code", () => {
        expect((search("benelux", events, teams)[0].document as any).code).toBe("NLCMP");
        expect(search("usncc", events, teams).some((r: any) => r.document.code == "USNCCMP")).toBe(
            true
        );
    });

    it("finds nothing for nothing", () => {
        expect(search("  ", events, teams)).toEqual([]);
    });
});

describe("highlightParts", () => {
    it("splits a name around the letters that matched", () => {
        expect(highlightParts("Turtles", [0, 1, 4])).toEqual([
            { text: "Tu", hit: true },
            { text: "rt", hit: false },
            { text: "l", hit: true },
            { text: "es", hit: false },
        ]);
    });
});
