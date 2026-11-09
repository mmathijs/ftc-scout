import { building } from "$app/environment";
import { INTER_FONT_FACES } from "$lib/fonts/inter/faces";
import { addHeadStyle, findStyle, markLinksLater, noscriptLinks, replaceStyle } from "./page";
import { usedCss } from "./used-css";

export function criticalCss(): (html: string) => Promise<string> {
    let later: string[] = [];
    return async (html) => {
        if (building) return html;
        let style = findStyle(html);
        if (style) {
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
