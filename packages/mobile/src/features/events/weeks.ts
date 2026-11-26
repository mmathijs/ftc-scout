import { DESCRIPTORS, type Season } from "@ftc-scout/common";
import { addDays, dateFromStr, daysBetween } from "@/format";

// Kickoff is midnight UTC, which is the evening before west of UTC: read its day in UTC
// and make the Monday at local midnight, as event dates are.
export function firstMonday(season: Season): Date {
    let kickoff = DESCRIPTORS[season].kickoff;
    let mondayZero = (kickoff.getUTCDay() + 6) % 7;
    return new Date(
        kickoff.getUTCFullYear(),
        kickoff.getUTCMonth(),
        kickoff.getUTCDate() - mondayZero
    );
}

export const BEFORE_KICKOFF = -1;

type WeekHeading = { kind: "week"; key: string; week: number; start: Date; end: Date };

export type WeekItem<E> = WeekHeading | { kind: "event"; key: string; event: E };

export function groupByWeek<E extends { season: number; code: string; start: string }>(
    events: E[],
    season: Season
): WeekItem<E>[] {
    let monday = firstMonday(season);
    let items: WeekItem<E>[] = [];
    let heading = null as WeekHeading | null;
    for (let event of events) {
        let date = dateFromStr(event.start);
        let week = Math.max(BEFORE_KICKOFF, Math.floor(daysBetween(monday, date) / 7));
        if (week != heading?.week) {
            let start = week == BEFORE_KICKOFF ? date : addDays(monday, week * 7);
            heading = { kind: "week", key: `w${week}`, week, start, end: addDays(start, 6) };
            items.push(heading);
        }
        // The events before kickoff are one group, from the first one's start to the last one's.
        if (week == BEFORE_KICKOFF) heading.end = date;
        items.push({ kind: "event", key: `${event.season}-${event.code}`, event });
    }
    return items;
}
