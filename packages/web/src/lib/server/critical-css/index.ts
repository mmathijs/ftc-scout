import { building } from "$app/environment";
import { findStyle, linkBeforeBodyEnd, replaceStyle, takeDisabledLinks } from "./page";
import { usedCss } from "./used-css";

export function criticalCss(): (html: string) => Promise<string> {
    let deferred: string[] = [];
    return async (html) => {
        let style = building ? null : findStyle(html);
        if (style) {
            let css = await usedCss(html, style).catch((e) => {
                console.error("critical CSS:", e);
                return null;
            });
            if (css !== null) html = replaceStyle(takeDisabledLinks(html, deferred), style, css);
        }
        if (deferred.length && html.includes("</body>")) {
            html = linkBeforeBodyEnd(html, deferred);
            deferred = [];
        }
        return html;
    };
}
