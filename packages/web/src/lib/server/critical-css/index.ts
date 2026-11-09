import { building } from "$app/environment";
import { INTER_FONT_FACES } from "$lib/fonts/inter/faces";
import { addHeadStyle, findStyle, markLinksLater, noscriptLinks, replaceStyle } from "./page";
import { usedCss } from "./used-css";

// Ignore bigger pages, dont spend to much time on them when percentage wise it doesn't matter
const ALL_CSS_ABOVE = 256 * 1024;

export function criticalCss(): (html: string) => Promise<string> {
    let later: string[] = [];
    return async (html) => {
        if (building) return html;
        let style = findStyle(html);
        if (style && html.length <= ALL_CSS_ABOVE) {
            let css = await usedCss(html, style).catch((e) => {
                console.error("critical CSS:", e);
                return null;
            });
            if (css !== null) html = replaceStyle(markLinksLater(html, later), style, css);
        }
        if (html.includes("</head>")) html = addHeadStyle(html, INTER_FONT_FACES);
        if (later.length && html.includes("</body>")) {
            html = noscriptLinks(html, later);
            later = [];
        }
        return html;
    };
}
