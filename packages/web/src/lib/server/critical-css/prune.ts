// Basic pruning before handing to beasties
import postcss from "postcss";
import { THEME_RULES, type PageTokens } from "./page";

const PSEUDO_ARGS = /::?[a-z-]+\((?:[^()]|\([^()]*\))*\)/gi;
const CLASS = /\.(-?[_a-zA-Z][\w-]*)/g;
const ID = /#(-?[_a-zA-Z][\w-]*)/g;
const GROUPING = /^(media|supports|container|layer)$/;

function possible(selector: string, page: PageTokens): boolean {
    let s = selector.replace(PSEUDO_ARGS, "");
    for (let m of s.matchAll(CLASS)) if (!page.classes.has(m[1])) return false;
    for (let m of s.matchAll(ID)) if (!page.ids.has(m[1])) return false;
    return true;
}

export function prune(css: string, page: PageTokens): string {
    let root = postcss.parse(css);
    root.walkRules((rule) => {
        if (THEME_RULES.some((re) => re.test(rule.selector))) return;
        if (!rule.selectors.some((s) => possible(s, page))) rule.remove();
    });
    root.walkAtRules((a) => {
        if (GROUPING.test(a.name) && a.nodes && !a.nodes.length) a.remove();
    });
    return root.toString();
}
