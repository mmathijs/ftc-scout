import type { Handle } from "@sveltejs/kit";
import { THEME_COOKIE_NAME } from "./lib/constants";
// import { lookup } from "ip-location-api";

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
        latitude: number;
        longitude: number;
    } = {
        country: "DE",
        timezone: "Europe/Berlin",
        region: "BY",
        region_name: "Bavaria",
        city: "Nuremberg",
        latitude: 49.4527,
        longitude: 11.0783,
    };

    /*
    try {
        const result = await lookup(ip);

        if (result) {
            geo = {
                country: result.country ?? "",
                timezone: result.timezone ?? "",
                region: result.region1 ?? "",
                region_name: result.region1_name ?? "",
                city: result.city ?? "",
                latitude: result.latitude ?? 0,
                longitude: result.longitude ?? 0,
            };
        }
    } catch (err) {}
*/

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
        response.headers.set("x-geo-latitude", geo.latitude.toString());
        response.headers.set("x-geo-longitude", geo.longitude.toString());
    }

    return response;
};
