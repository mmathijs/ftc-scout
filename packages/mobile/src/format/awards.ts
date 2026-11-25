// From the website's printers/award.ts and util/sorters.ts, which read its generated enums.
import type { AwardType } from "@/api/generated/types";
import { prettyPrintOrdinal } from "@web/printers/number";

const NAMES: Record<AwardType, string> = {
    Compass: "Compass Award",
    Connect: "Connect Award",
    Control: "Control Award",
    DeansListFinalist: "Dean's List Finalist",
    DeansListSemiFinalist: "Dean's List Semifinalist",
    DeansListWinner: "Dean's List Winner",
    Design: "Design Award",
    ConferenceFinalist: "Conference Finalist Alliance",
    DivisionFinalist: "Division Finalist Alliance",
    DivisionWinner: "Division Winning Alliance",
    Winner: "Winning Alliance",
    Finalist: "Finalist Alliance",
    Innovate: "Innovate Award",
    Inspire: "Inspire Award",
    JudgesChoice: "Judges' Choice Award",
    Motivate: "Motivate Award",
    Reach: "Reach Award",
    Sustain: "Sustain Award",
    Promote: "Promote Award",
    Think: "Think Award",
    TopRanked: "Top Ranked",
};

const LEADERSHIP_NAMES: Partial<Record<AwardType, string>> = {
    DeansListFinalist: "FIRST Leadership Award Finalist",
    DeansListSemiFinalist: "FIRST Leadership Award Semifinalist",
    DeansListWinner: "FIRST Leadership Award Winner",
};

const ALLIANCE: AwardType[] = [
    "ConferenceFinalist",
    "DivisionFinalist",
    "DivisionWinner",
    "Winner",
    "Finalist",
];
const PERSON: AwardType[] = ["DeansListFinalist", "DeansListSemiFinalist", "DeansListWinner"];

const ORDER: AwardType[] = [
    "Inspire",
    "TopRanked",
    "Winner",
    "Finalist",
    "DivisionWinner",
    "DivisionFinalist",
    "ConferenceFinalist",
    "Think",
    "Connect",
    "Sustain",
    "Innovate",
    "Control",
    "Motivate",
    "Reach",
    "Design",
    "Promote",
    "Compass",
    "JudgesChoice",
    "DeansListWinner",
    "DeansListFinalist",
    "DeansListSemiFinalist",
];

function awardName(type: AwardType, season: number | null = null): string {
    if (season && season >= 2025 && LEADERSHIP_NAMES[type]) return LEADERSHIP_NAMES[type]!;
    return NAMES[type] ?? "Unknown Award";
}

export function awardCategory(type: AwardType, season: number | null = null): string {
    if (PERSON.includes(type)) return awardName(type, season) + "s";
    if (ALLIANCE.includes(type) || type == "TopRanked") return awardName(type);
    return awardName(type) + " Winners";
}

export function awardPlacementParts(
    type: AwardType,
    placement: number,
    personName: string | null,
    season: number | null = null
): [string, string] {
    if (PERSON.includes(type))
        return [awardName(type, season), personName ? `(${personName})` : ""];
    if (ALLIANCE.includes(type)) {
        return [
            awardName(type),
            placement == 1 ? "Captain" : `${prettyPrintOrdinal(placement - 1)} Pick`,
        ];
    }
    if (type == "TopRanked") return ["Top Ranked", prettyPrintOrdinal(placement) + " Place"];
    return [awardName(type), placement == 1 ? "Winner" : `${prettyPrintOrdinal(placement)} Place`];
}

export function awardPlaceLabel(type: AwardType, placement: number): string {
    if (PERSON.includes(type) || type == "JudgesChoice") return "";
    if (ALLIANCE.includes(type)) {
        return placement == 1 ? "Captain" : `${prettyPrintOrdinal(placement - 1)} pick`;
    }
    return prettyPrintOrdinal(placement);
}

export function awardIsRanked(type: AwardType): boolean {
    return type != "JudgesChoice" && !PERSON.includes(type);
}

export function sortAwardTypes(a: AwardType, b: AwardType): number {
    return ORDER.indexOf(a) - ORDER.indexOf(b);
}
