// prune by class and id, cache for some more speed
import Beasties from "beasties";
import { createHash } from "crypto";
import { THEME_RULES, pageTokens, replaceStyle, withoutScripts, type InlineStyle } from "./page";
import { prune } from "./prune";

const beasties = new Beasties({
    external: false,
    reduceInlineStyles: true,
    mergeStylesheets: true,
    inlineFonts: true,
    preloadFonts: false,
    keyframes: "critical",
    compress: true,
    logLevel: "silent",
    allowRules: THEME_RULES,
});

const MAX_RESULTS = 512;
const results = new Map<string, string>();

function cacheKey(css: string, classes: Set<string>, ids: Set<string>): string {
    let h = createHash("sha1");
    for (let p of [css, [...classes].sort().join(" "), [...ids].sort().join(" ")]) {
        h.update(p).update("\0");
    }
    return h.digest("base64");
}

export async function usedCss(html: string, style: InlineStyle): Promise<string | null> {
    let page = pageTokens(html);
    let key = cacheKey(style.css, page.classes, page.ids);
    let known = results.get(key);
    if (known !== undefined) {
        results.delete(key);
        results.set(key, known);
        return known;
    }

    let pruned = prune(style.css, page);
    let out = await beasties.process(replaceStyle(withoutScripts(html), style, pruned));
    let used = /<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/.exec(out)?.[1];
    if (used === undefined) return null;

    results.set(key, used);
    if (results.size > MAX_RESULTS) results.delete(results.keys().next().value!);
    return used;
}
