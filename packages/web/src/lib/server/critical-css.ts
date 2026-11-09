import Beasties from "beasties";
import { building } from "$app/environment";

const beasties = new Beasties({
    external: false,
    reduceInlineStyles: true,
    mergeStylesheets: true,
    inlineFonts: true,
    preloadFonts: false,
    keyframes: "critical",
    compress: true,
    logLevel: "silent",
    // Allow switching theme before css file loads
    allowRules: [/body\.(dark|light|system)/, /body:not\(\.light\)/],
});

const STYLE = /(<style(?:\s[^>]*)?>)([\s\S]*?)<\/style>/;
const FONT_FACE = /@font-face\{[^}]*\}/g;
const DISABLED_LINK =
    /<link href="([^"]+\.css)" rel="stylesheet" disabled media="\(max-width: 0\)">\s*/g;

export function criticalCss(): (opts: { html: string; done: boolean }) => Promise<string> {
    let links: string[] = [];
    return async ({ html }) => {
        let style = building ? null : STYLE.exec(html);
        if (style) {
            try {
                let critical = STYLE.exec(await beasties.process(html));
                if (critical) {
                    let fonts = (style[2].match(FONT_FACE) ?? []).join("");
                    let css = style[1] + fonts + critical[2].replace(FONT_FACE, "") + "</style>";
                    html = html.replace(DISABLED_LINK, (_, href: string) => {
                        links.push(href);
                        return "";
                    });
                    html = html.replace(style[0], () => css);
                }
            } catch (e) {
                console.error("critical CSS:", e);
            }
        }
        if (links.length && html.includes("</body>")) {
            let tags = links.map((href) => `<link href="${href}" rel="stylesheet">`).join("");
            html = html.replace("</body>", () => tags + "</body>");
            links = [];
        }
        return html;
    };
}
