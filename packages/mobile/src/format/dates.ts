// Hermes has no Intl formatRange, and a formatter given a time zone the phone doesn't know throws.
import { dateFromStr } from "@web/util/date";

type Parts = {
    long: Intl.DateTimeFormat;
    short: Intl.DateTimeFormat;
    longNoYear: Intl.DateTimeFormat;
    shortNoYear: Intl.DateTimeFormat;
};

let dayFormats: Parts | null = null;

function days(): Parts {
    dayFormats ??= {
        long: new Intl.DateTimeFormat(undefined, {
            day: "numeric",
            month: "long",
            year: "numeric",
        }),
        short: new Intl.DateTimeFormat(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
        }),
        longNoYear: new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }),
        shortNoYear: new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }),
    };
    return dayFormats;
}

export function prettyPrintDateRange(start: Date, end: Date, short = false): string {
    let f = days();
    let full = short ? f.short : f.long;
    if (
        start.getFullYear() == end.getFullYear() &&
        start.getMonth() == end.getMonth() &&
        start.getDate() == end.getDate()
    ) {
        return full.format(start);
    }
    let first =
        start.getFullYear() == end.getFullYear() ? (short ? f.shortNoYear : f.longNoYear) : full;
    return `${first.format(start)} – ${full.format(end)}`;
}

export function prettyPrintDateRangeString(start: string, end: string, short = false): string {
    return prettyPrintDateRange(dateFromStr(start), dateFromStr(end || start), short);
}

// Making a formatter is slow, and a match list prints hundreds.
const timeFormats = new Map<string, Intl.DateTimeFormat>();

function timeFormat(timeZone: string): Intl.DateTimeFormat {
    let f = timeFormats.get(timeZone);
    if (!f) {
        let options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
        try {
            f = new Intl.DateTimeFormat(undefined, { ...options, timeZone });
        } catch {
            f = new Intl.DateTimeFormat(undefined, options);
        }
        timeFormats.set(timeZone, f);
    }
    return f;
}

export function prettyPrintTime(t: Date, timeZone: string): string {
    return timeFormat(timeZone).format(t);
}

export function prettyPrintTimeString(time: string, timeZone: string): string {
    return prettyPrintTime(new Date(time), timeZone);
}
