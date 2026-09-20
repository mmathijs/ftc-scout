export const RankingMetric = { Epa: "Epa", Opr: "Opr" } as const;
export type RankingMetric = (typeof RankingMetric)[keyof typeof RankingMetric];

export const RANKING_METRIC_EC_DC = {
    encode: (m: RankingMetric): string | null => (m == RankingMetric.Epa ? null : m),
    decode: (s: string | null): RankingMetric =>
        s == RankingMetric.Opr ? RankingMetric.Opr : RankingMetric.Epa,
};
