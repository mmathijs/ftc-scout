import { awardGroups, divisions } from "./divisions";

describe("divisions", () => {
    let related = [
        { season: 2025, code: "NLCMPVIN", name: "Benelux Championship - Vinci Division" },
        { season: 2025, code: "NLCMPJAC", name: "Benelux Championship - Jacobs Division" },
    ];

    it("names each division by what is its own, in order of code", () => {
        expect(divisions("Benelux Championship", related).map((d) => d.label)).toEqual([
            "Jacobs Division",
            "Vinci Division",
        ]);
    });

    it("calls the parent event the Finals Division when seen from a division", () => {
        let fromJacobs = divisions("Benelux Championship - Jacobs Division", [
            { season: 2025, code: "NLCMP", name: "Benelux Championship" },
            related[0],
        ]);
        expect(fromJacobs.map((d) => d.label)).toEqual(["Finals Division", "Vinci Division"]);
    });

    it("keeps where each one leads", () => {
        expect(divisions("Benelux Championship", related)[0]).toMatchObject({
            season: 2025,
            code: "NLCMPJAC",
        });
    });

    it("has none for an event on its own", () => {
        expect(divisions("Qualifier The Hague", [])).toEqual([]);
    });
});

describe("awardGroups", () => {
    it("lists an award once per division, awards in their usual order", () => {
        let awards = [
            { type: "Think" as const, divisionName: "Vinci" },
            { type: "Inspire" as const, divisionName: null },
            { type: "Think" as const, divisionName: "Jacobs" },
            { type: "Think" as const, divisionName: "Jacobs" },
        ];
        expect(awardGroups(awards)).toEqual([
            { type: "Inspire", divisionName: null },
            { type: "Think", divisionName: "Jacobs" },
            { type: "Think", divisionName: "Vinci" },
        ]);
    });
});
