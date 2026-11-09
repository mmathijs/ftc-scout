import { building } from "$app/environment";
import { findStyle, markLinksLater, noscriptLinks, replaceStyle } from "./page";
import { usedCss } from "./used-css";

export function criticalCss(): (html: string) => Promise<string> {
    let later: string[] = [];
    return async (html) => {
        let style = building ? null : findStyle(html);
        if (style) {
            let css = await usedCss(html, style).catch((e) => {
                console.error("critical CSS:", e);
                return null;
            });
            if (css !== null) html = replaceStyle(markLinksLater(html, later), style, css);
        }
        if (later.length && html.includes("</body>")) {
            html = noscriptLinks(html, later);
            later = [];
        }
        return html;
    };
}
