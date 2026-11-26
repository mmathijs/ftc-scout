import { Color, NonRankStatColumn, SortDir, StatSet, StatType } from "@ftc-scout/common";
import { nextSort, sortAndRank } from "./localSort";

type Row = { team: number; opr: number | null };

const col = (id: keyof Row) =>
    new NonRankStatColumn<Row>({
        id,
        columnName: id,
        dialogName: id,
        titleName: id,
        sqlExpr: id,
        color: Color.White,
        ty: StatType.Float,
        getNonRankValue: (d) => (d[id] == null ? null : { ty: "float", val: d[id]! }),
    });

const stats = new StatSet<Row>("test", [col("team"), col("opr")], []);
const byTeam = { id: "team", dir: SortDir.Asc };

describe("sortAndRank", () => {
    let rows: Row[] = [
        { team: 3, opr: 50 },
        { team: 1, opr: 80 },
        { team: 4, opr: null },
        { team: 2, opr: 80 },
    ];

    it("sorts, shares a rank between equal values and leaves rows without a value last and unranked", () => {
        let out = sortAndRank(rows, stats, { id: "opr", dir: SortDir.Desc }, byTeam);
        expect(out.map((r) => [r.data.team, r.noFilterRank])).toEqual([
            [1, 1],
            [2, 1],
            [3, 3],
            [4, 0],
        ]);
    });

    it("does not change the rows it was given", () => {
        let copy = [...rows];
        sortAndRank(rows, stats, { id: "opr", dir: SortDir.Asc }, byTeam);
        expect(rows).toEqual(copy);
    });
});

describe("nextSort", () => {
    it("goes descending, ascending, then back to the default", () => {
        let s = nextSort(byTeam, "opr", byTeam);
        expect(s).toEqual({ id: "opr", dir: SortDir.Desc });
        s = nextSort(s, "opr", byTeam);
        expect(s).toEqual({ id: "opr", dir: SortDir.Asc });
        expect(nextSort(s, "opr", byTeam)).toEqual(byTeam);
    });

    it("only flips the default column", () => {
        expect(nextSort(byTeam, "team", byTeam)).toEqual({ id: "team", dir: SortDir.Desc });
    });
});

describe("nextSort from another column", () => {
    it("starts the default's own column at the default, not reversed", () => {
        let byOpr = { id: "opr", dir: SortDir.Desc };
        expect(nextSort(byOpr, "team", byTeam)).toEqual(byTeam);
    });
});
