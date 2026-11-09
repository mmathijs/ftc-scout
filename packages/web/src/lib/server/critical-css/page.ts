// inlineStyleThreshold: Infinity puts all the css in the page,
// filter out what is not needed for a first draw

export type InlineStyle = { tag: string; open: string; css: string };

export type PageTokens = { classes: Set<string>; ids: Set<string> };

export const THEME_RULES = [/body\.(dark|light|system)/, /body:not\(\.light\)/];

const STYLE = /(<style(?:\s[^>]*)?>)([\s\S]*?)<\/style>/;
const SCRIPT = /(<script\b[^>]*>)[\s\S]*?(<\/script>)/g;
// SvelteKit writes the stylesheets it inlined as disabled links, for client-side navigation.
const DISABLED_LINK =
    /<link href="([^"]+\.css)" rel="stylesheet" disabled media="\(max-width: 0\)">\s*/g;

export function findStyle(html: string): InlineStyle | null {
    let m = STYLE.exec(html);
    return m && { tag: m[0], open: m[1], css: m[2] };
}

export function replaceStyle(html: string, style: InlineStyle, css: string): string {
    return html.replace(style.tag, () => style.open + css + "</style>");
}

export function withoutScripts(html: string): string {
    return html.replace(SCRIPT, "$1$2");
}

export function takeDisabledLinks(html: string, hrefs: string[]): string {
    return html.replace(DISABLED_LINK, (_, href: string) => {
        hrefs.push(href);
        return "";
    });
}

export function linkBeforeBodyEnd(html: string, hrefs: string[]): string {
    let tags = hrefs.map((href) => `<link href="${href}" rel="stylesheet">`).join("");
    return html.replace("</body>", () => tags + "</body>");
}

/** The class names and ids in the page's attributes */
export function pageTokens(html: string): PageTokens {
    let classes = new Set<string>();
    let ids = new Set<string>();
    for (let m of html.matchAll(/\sclass="([^"]*)"/g)) {
        for (let c of m[1].split(/\s+/)) if (c) classes.add(c);
    }
    for (let m of html.matchAll(/\sid="([^"]*)"/g)) ids.add(m[1]);
    return { classes, ids };
}
