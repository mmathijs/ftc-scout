import type { Handle } from "@sveltejs/kit";
import { THEME_COOKIE_NAME } from "./lib/constants";
import { criticalCss } from "$lib/server/critical-css";

export const handle: Handle = async ({ event, resolve }) => {
    let theme = "system";
    try {
        let cookieVal = event.cookies.get(THEME_COOKIE_NAME);
        theme = JSON.parse(cookieVal ?? "").preference ?? "system";
    } catch {}

    let css = criticalCss();
    let response = await resolve(event, {
        filterSerializedResponseHeaders: (name) => ["content-type"].indexOf(name) != -1,
        transformPageChunk: ({ html }) => css(html.replace("%theme%", `class="${theme}"`)),
    });

    return response;
};
