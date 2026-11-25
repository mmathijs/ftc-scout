jest.mock("@/storage", () => ({ storage: require("@/storage.fake").fakeStorage() }));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), dismiss: jest.fn() } }));

import { CURRENT_SEASON } from "@ftc-scout/common";
import { router } from "expo-router";
import { openEvent, openPages, openTeam, pagesAbove, setNavigation } from "./nav";

// The router's state after: Teams tab, team 7, an event, team 9.
const state = {
    routes: [
        {
            name: "__root",
            state: {
                routes: [
                    { name: "(tabs)", state: { routes: [{ name: "teams" }] } },
                    { name: "team/[number]", params: { number: "7", name: "Tactical Sheep" } },
                    { name: "event/[season]/[code]", params: { season: "2025", code: "NLTHQ" } },
                    { name: "team/[number]", params: { number: "9", season: "2024" } },
                ],
            },
        },
    ],
};

describe("openPages", () => {
    it("finds the pages over the tabs, wherever the router keeps them", () => {
        expect(openPages(state).map((p) => p.name)).toEqual([
            "(tabs)",
            "team/[number]",
            "event/[season]/[code]",
            "team/[number]",
        ]);
    });

    it("finds them when the app was opened straight onto a page, with no tabs under it", () => {
        let linked = {
            routes: [
                {
                    name: "__root",
                    state: { routes: [{ name: "team/[number]", params: { number: "7" } }] },
                },
            ],
        };
        expect(openPages(linked).map((p) => p.name)).toEqual(["team/[number]"]);
    });

    it("is empty before there is any navigation", () => {
        expect(openPages(undefined)).toEqual([]);
    });
});

describe("pagesAbove", () => {
    let pages = openPages(state);
    let team = (n: string) => (p: { name: string; params?: any }) => p.params?.number == n;

    it("counts the pages over one that is already open, and is zero for the top one", () => {
        expect(pagesAbove(pages, team("7"))).toBe(2);
        expect(pagesAbove(pages, team("9"))).toBe(0);
    });

    it("is null for a page that isn't open", () => {
        expect(pagesAbove(pages, team("70"))).toBeNull();
    });
});

describe("opening a page", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setNavigation({ getRootState: () => state });
    });

    it("goes back to the page when it is open already", () => {
        openTeam(7, "Tactical Sheep");
        openEvent(2025, "NLTHQ");
        expect(router.dismiss).toHaveBeenNthCalledWith(1, 2);
        expect(router.dismiss).toHaveBeenNthCalledWith(2, 1);
        expect(router.push).not.toHaveBeenCalled();
    });

    it("opens another page for a team on another season than the open one shows", () => {
        openTeam(9, null, 2025);
        openTeam(7, null, 2024);
        expect(router.push).toHaveBeenNthCalledWith(1, "/team/9?season=2025&d=4");
        expect(router.push).toHaveBeenNthCalledWith(2, "/team/7?season=2024&d=4");
        expect(router.dismiss).not.toHaveBeenCalled();
    });

    it("goes back to a team on the season it was asked for, or the default one", () => {
        openTeam(7, null, CURRENT_SEASON);
        openTeam(9, null, 2024);
        expect(router.dismiss).toHaveBeenCalledWith(2);
        expect(router.dismiss).toHaveBeenCalledTimes(1);
    });

    it("opens an event of another season", () => {
        openEvent(2024, "NLTHQ", "Thanksgiving Qualifier");
        expect(router.push).toHaveBeenCalledWith(
            "/event/2024/NLTHQ?name=Thanksgiving%20Qualifier&d=4"
        );
    });
});
