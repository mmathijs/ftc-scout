import { ALL_SEASONS, type Season } from "@ftc-scout/common";

// Links can hold anything (/team/abc, /event/1999/X), and the API counts the errors it answers.

export function isTeamNumber(n: unknown): n is number {
    return typeof n == "number" && Number.isInteger(n) && n >= 1 && n <= 999_999_999;
}

export function isSeason(n: unknown): n is Season {
    return (ALL_SEASONS as readonly unknown[]).includes(n);
}

export function teamNumberParam(raw: unknown): number | null {
    return typeof raw == "string" && /^[1-9]\d{0,8}$/.test(raw) ? Number(raw) : null;
}

export function seasonParam(raw: unknown): Season | null {
    let n = typeof raw == "string" && /^\d{4}$/.test(raw) ? Number(raw) : null;
    return isSeason(n) ? n : null;
}
