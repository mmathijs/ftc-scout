jest.mock("@expo/vector-icons/FontAwesome6", () => "FontAwesome6");

import { tabsFit } from "./FolderTabs";

describe("tabsFit", () => {
    let event = ["Matches", "Rankings", "Insights", "Awards", "Teams (12)"];

    it("says an event's five named tabs don't fit a phone, so the others fold to icons", () => {
        expect(tabsFit(event, 390)).toBe(false);
        expect(tabsFit(event, 430)).toBe(false);
    });

    it("says they do fit a tablet", () => {
        expect(tabsFit(event, 820)).toBe(true);
    });

    it("says the records' two tabs fit any phone", () => {
        expect(tabsFit(["Teams", "Matches"], 320)).toBe(true);
    });

    it("allows for larger text", () => {
        expect(tabsFit(["Teams", "Matches", "Rankings"], 390)).toBe(true);
        expect(tabsFit(["Teams", "Matches", "Rankings"], 390, 1.3)).toBe(false);
    });
});
