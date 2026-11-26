import { savedAt } from "@/format";
import { savedNote } from "./savedNote";

const at = Date.parse("2026-11-26T21:11:00Z");
const base = { online: true, failed: false, slow: false, updatedAt: at };

describe("savedNote", () => {
    it("says nothing while the data is current", () => {
        expect(savedNote(base)).toBeNull();
    });

    it("says offline, with when the data was saved", () => {
        expect(savedNote({ ...base, online: false, slow: true })).toEqual({
            kind: "offline",
            text: `Offline · saved ${savedAt(at)}`,
        });
    });

    it("says a refresh failed before that it is slow", () => {
        expect(savedNote({ ...base, failed: true, slow: true })?.kind).toBe("failed");
    });

    it("says the connection is slow while old data is shown", () => {
        expect(savedNote({ ...base, slow: true })).toEqual({
            kind: "slow",
            text: `Slow connection · showing data from ${savedAt(at)} until the latest arrives`,
        });
    });

    it("says the connection is slow while nothing is shown yet", () => {
        expect(savedNote({ ...base, slow: true, updatedAt: 0 })?.text).toBe(
            "Slow connection · still loading"
        );
    });

    it("says nothing about saved data that isn't there", () => {
        expect(savedNote({ ...base, online: false, updatedAt: 0 })).toBeNull();
        expect(savedNote({ ...base, failed: true, updatedAt: 0 })).toBeNull();
    });
});
