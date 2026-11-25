export const API_ORIGIN = (
    process.env.EXPO_PUBLIC_API_ORIGIN || "https://ftcscout-api.mmathijs.nl"
).replace(/\/$/, "");

export const SITE_ORIGIN = (
    process.env.EXPO_PUBLIC_SITE_ORIGIN || "https://ftcscout.mmathijs.nl"
).replace(/\/$/, "");

export function apiUrl(path: string): string {
    return API_ORIGIN + path;
}
