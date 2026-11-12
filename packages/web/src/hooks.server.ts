import type { Handle } from "@sveltejs/kit";
import { THEME_COOKIE_NAME } from "$lib/constants";

export const handle: Handle = async ({ event, resolve }) => {
    let theme = "system";
    try {
        let cookieVal = event.cookies.get(THEME_COOKIE_NAME);
        theme = JSON.parse(cookieVal ?? "").preference ?? "system";
    } catch {}

    const ip =
        event.request.headers.get("x-forwarded-for")?.split(",")[0] ?? event.getClientAddress();

    let geo: {
        country: string;
        timezone: string;
        region: string;
        region_name: string;
        city: string;
        latitude: number | null;
        longitude: number | null;
    } = (() => {
        const headers = event.request.headers;
        const first = (...names: string[]) =>
            names.map((n) => headers.get(n)).find((v) => v !== null && v !== undefined && v !== "");
        const parseFloatOrNull = (val: string | null | undefined) => {
            const n = val ? Number.parseFloat(val) : NaN;
            return Number.isFinite(n) ? n : null;
        };

        return {
            country: first("cf-ipcountry", "cf-country", "x-geo-country") ?? "",
            timezone: first("cf-timezone", "x-geo-timezone", "x-client-timezone") ?? "",
            region: first("cf-region-code", "cf-ipregion", "x-geo-region") ?? "",
            region_name: first("cf-region", "x-geo-region-name") ?? "",
            city: first("cf-city", "cf-ipcity", "x-geo-city") ?? "",
            latitude: parseFloatOrNull(
                first("cf-iplatitude", "cf-client-geo-latitude", "x-geo-latitude")
            ),
            longitude: parseFloatOrNull(
                first("cf-iplongitude", "cf-client-geo-longitude", "x-geo-longitude")
            ),
        };
    })();

    console.log(`IP: ${ip}, Geo: ${JSON.stringify(geo)}`);

    event.locals.geo = geo;

    let response = await resolve(event, {
        filterSerializedResponseHeaders: (name) => ["content-type"].indexOf(name) != -1,
        transformPageChunk: ({ html }) => html.replace("%theme%", `class="${theme}"`),
    });

    if (geo) {
        response.headers.set("x-geo-timezone", geo.timezone);
        response.headers.set("x-geo-country", geo.country);
        response.headers.set("x-geo-region", geo.region);
        response.headers.set("x-geo-city", geo.city);
        if (geo.latitude !== null) response.headers.set("x-geo-latitude", geo.latitude.toString());
        if (geo.longitude !== null)
            response.headers.set("x-geo-longitude", geo.longitude.toString());
    }

    return response;
};
