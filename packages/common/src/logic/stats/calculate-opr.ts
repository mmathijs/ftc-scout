import { Matrix, SingularValueDecomposition } from "ml-matrix";

// Based on this guide for OPR calculation: https://blog.thebluealliance.com/2017/10/05/the-math-behind-opr-an-introduction/

export interface OprData {
    team1: number;
    team2: number;
    /** Results per stat */
    results: Record<string, number>;
}

export function calculateOpr(
    scores: OprData[],
    stats: string[]
): Record<string, Record<number, number>> {
    let ret: Record<string, Record<number, number>> = {};
    for (let stat of stats) ret[stat] = {};
    if (scores.length == 0 || stats.length == 0) return ret;

    let allTeams = [...new Set(scores.flatMap((s) => [s.team1, s.team2]))];

    let allianceMatrix = new Matrix(
        scores.map((s) => allTeams.map((t) => (t == s.team1 || t == s.team2 ? 1 : 0)))
    );
    let resultsMatrix = new Matrix(scores.map((s) => stats.map((stat) => s.results[stat])));

    let oprs = new SingularValueDecomposition(allianceMatrix, {
        autoTranspose: true,
    }).solve(resultsMatrix);

    stats.forEach((stat, j) => {
        for (let i = 0; i < allTeams.length; i++) {
            ret[stat][allTeams[i]] = oprs.get(i, j);
        }
    });
    return ret;
}
