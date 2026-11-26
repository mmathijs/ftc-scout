import { cellWidth, loadColumns } from "./columns";

describe("cellWidth", () => {
    it("leaves half a column showing when the stats don't all fit", () => {
        // 362 wide, 8 stats: five whole columns and half of the sixth.
        let w = cellWidth(362, 8);
        expect(362 / w).toBeCloseTo(5.5);
        expect(w).toBeGreaterThanOrEqual(62);
    });

    it("shares the width when everything fits", () => {
        expect(cellWidth(362, 4)).toBeCloseTo(90.5);
    });

    it("always shows at least one column and a half on a very narrow table", () => {
        expect(100 / cellWidth(100, 8)).toBeCloseTo(1.5);
    });

    it("has a width before the table has been measured", () => {
        expect(cellWidth(0, 8)).toBeGreaterThan(0);
    });
});

describe("loadColumns", () => {
    it("keeps a list of stat ids", () => {
        expect(loadColumns(["a", "b"])).toEqual(["a", "b"]);
        expect(loadColumns([])).toEqual([]);
    });

    it("gives the defaults for nothing and for a damaged value", () => {
        for (let v of [null, undefined, "x", {}, 5, false, ["a", 5], [null]]) {
            expect(loadColumns(v)).toBeNull();
        }
    });
});
