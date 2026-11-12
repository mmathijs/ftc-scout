import {
    EpaStatLevelFilter,
    EpaStatWindow,
    PredictionSourceFilter,
} from "$lib/graphql/generated/graphql-operations";
import { INT_EC_DC } from "$lib/util/search-params/int";

export const ALL_SOURCES: PredictionSourceFilter[] = [
    PredictionSourceFilter.Epa,
    PredictionSourceFilter.EpaNp,
    PredictionSourceFilter.Opr,
    PredictionSourceFilter.WinLoss,
];

// Multiple predictors can be shown on the graph together, so this is a comma-separated list
// rather than a single value - "none" is a real, distinct state (all unchecked) from the default.
export const STAT_SOURCES_EC_DC = {
    encode: (v: PredictionSourceFilter[]): string | null => {
        if (v.length == 1 && v[0] == PredictionSourceFilter.Epa) return null;
        return v.length ? v.join(",") : "none";
    },
    decode: (s: string | null): PredictionSourceFilter[] => {
        if (s == null) return [PredictionSourceFilter.Epa];
        if (s == "none") return [];
        return s
            .split(",")
            .filter((p): p is PredictionSourceFilter =>
                ALL_SOURCES.includes(p as PredictionSourceFilter)
            );
    },
};

export const STAT_LEVEL_EC_DC = {
    encode: (v: EpaStatLevelFilter) => (v == EpaStatLevelFilter.All ? null : v),
    decode: (s: string | null): EpaStatLevelFilter =>
        s == EpaStatLevelFilter.Quals
            ? EpaStatLevelFilter.Quals
            : s == EpaStatLevelFilter.Playoff
            ? EpaStatLevelFilter.Playoff
            : EpaStatLevelFilter.All,
};

export const STAT_WINDOW_EC_DC = {
    encode: (v: EpaStatWindow) => (v == EpaStatWindow.Cumulative ? null : v),
    decode: (s: string | null): EpaStatWindow =>
        s == EpaStatWindow.Daily
            ? EpaStatWindow.Daily
            : s == EpaStatWindow.Trailing
            ? EpaStatWindow.Trailing
            : EpaStatWindow.Cumulative,
};

export const STAT_DAYS_EC_DC = INT_EC_DC(7, 1, 365);

export type Metric = "accuracy" | "brierScore" | "logLoss" | "scoreMae" | "scoreRmse";

export const METRIC_EC_DC = {
    encode: (m: Metric) => (m == "accuracy" ? null : m),
    decode: (s: string | null): Metric =>
        s == "brierScore" || s == "logLoss" || s == "scoreMae" || s == "scoreRmse" ? s : "accuracy",
};

// WinLoss has no score model at all (it only ever compares win rates), so its rows never carry
// a meaningful predicted score - MAE/RMSE would just show a misleading flat 0. When comparing
// several predictors at once, a metric only makes sense if every currently-shown one supports it.
export function metricsAvailableFor(sources: PredictionSourceFilter[]): Metric[] {
    if (sources.includes(PredictionSourceFilter.WinLoss))
        return ["accuracy", "brierScore", "logLoss"];
    return ["accuracy", "brierScore", "logLoss", "scoreMae", "scoreRmse"];
}

export function metricLabel(m: Metric): string {
    return {
        accuracy: "Accuracy",
        brierScore: "Brier Score",
        logLoss: "Log Loss",
        scoreMae: "Score MAE",
        scoreRmse: "Score RMSE",
    }[m];
}

export function sourceLabel(source: PredictionSourceFilter): string {
    return {
        Epa: "EPA",
        EpaNp: "EPA (No Penalty)",
        Opr: "OPR",
        WinLoss: "Win/loss record",
    }[source];
}

// Arbitrary but fixed per source, so a predictor's line is always the same color no matter which
// other predictors are shown alongside it.
const SOURCE_COLORS: Record<PredictionSourceFilter, string> = {
    Epa: "var(--inline-theme-color)",
    EpaNp: "#2e9e6c",
    Opr: "#e0972e",
    WinLoss: "#8a5fd6",
};
export function sourceColor(source: PredictionSourceFilter): string {
    return SOURCE_COLORS[source];
}

// Lower is better for brier/logLoss/MAE/RMSE, higher is better for accuracy - matters for the
// chart's axis orientation isn't flipped, just for labeling which direction is "good".
export function formatMetricValue(m: Metric, v: number | null | undefined): string {
    if (v == null) return "N/A";
    switch (m) {
        case "accuracy":
            return (v * 100).toFixed(1) + "%";
        case "brierScore":
        case "logLoss":
            return v.toFixed(4);
        case "scoreMae":
        case "scoreRmse":
            return v.toFixed(2);
    }
}
