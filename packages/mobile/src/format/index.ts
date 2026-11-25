export { prettyPrintFloat, prettyPrintOrdinal } from "@web/printers/number";
export { prettyPrintEventTypeShort } from "@web/printers/eventType";
export { prettyPrintRegionCode } from "@web/printers/regionCode";
export { prettyPrintURL } from "@web/printers/url";
export { regionName, regionMatches, REGION_GROUPS } from "@web/util/regions";
export {
    eventTyNames,
    eventTyMatches,
    COMP_EVENT_TY_GROUPS,
    EVENT_TY_GROUPS,
    isCompetition,
} from "@web/util/event-type";
import { dateToStr } from "@web/util/date";

export { dateFromStr, addDays, daysBetween } from "@web/util/date";

/** A day on the phone's calendar, as yyyy-mm-dd. */
export function localDay(date: Date = new Date()): string {
    return dateToStr(date)!;
}
export * from "./awards";
export * from "./dates";

export type Location = { venue?: string | null; city: string; state: string; country: string };

export function locationString(l: Location | null | undefined): string {
    if (!l) return "";
    return [l.venue, l.city, l.state, l.country]
        .map((p) => p?.trim())
        .filter((p) => !!p)
        .join(", ");
}

export function mapsUrl(place: string): string {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(place);
}

// FIRST stores some websites without "https://", and only http(s) is ever opened.
export function webUrl(raw: string | null | undefined): string | null {
    let text = raw?.trim();
    if (!text || /\s/.test(text)) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = "https://" + text;
    return /^https?:\/\/[^/]+\.[^/]+/i.test(text) ? text : null;
}

const SAVED_FORMAT = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
});

export function savedAt(ms: number): string {
    return SAVED_FORMAT.format(new Date(ms));
}

export function formatDelay(ms: number): string {
    let mins = Math.round(Math.abs(ms) / 60000);
    if (mins == 0) return "On schedule";
    return ms > 0 ? `About ${mins} min behind schedule` : `About ${mins} min ahead of schedule`;
}
