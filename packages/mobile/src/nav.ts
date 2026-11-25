import { router, type Href } from "expo-router";
import { settings } from "@/store/settings";

type Route = { name: string; params?: Record<string, unknown>; state?: NavState };
type NavState = { routes: Route[] };

let navigation: { getRootState(): unknown } | null = null;

export function setNavigation(ref: { getRootState(): unknown }) {
    navigation = ref;
}

function rootState(): NavState | undefined {
    try {
        return navigation?.getRootState() as NavState | undefined;
    } catch {
        return undefined;
    }
}

const PAGES = ["(tabs)", "team/[number]", "event/[season]/[code]", "search", "settings"];

export function openPages(state: NavState | undefined = rootState()): Route[] {
    // Opened from a link straight onto a team, the pages' stack has no tabs under it.
    let stack: NavState | undefined = state;
    while (stack && !stack.routes.some((r) => PAGES.includes(r.name))) {
        stack = stack.routes.find((r) => r.state)?.state;
    }
    return stack?.routes ?? [];
}

export function pagesAbove(pages: Route[], isIt: (page: Route) => boolean): number | null {
    for (let i = pages.length - 1; i >= 0; i--) {
        if (isIt(pages[i])) return pages.length - 1 - i;
    }
    return null;
}

const param = (page: Route, key: string) => String(page.params?.[key]);

// Goes back to a page that's already open underneath instead of piling up copies. `d` is the new
// page's depth, so deep pages can offer a way home.
function open(href: string, isIt: (page: Route) => boolean) {
    let pages = openPages();
    let above = pagesAbove(pages, isIt);
    if (above == null) {
        let depth = Math.max(1, pages.length);
        router.push((href + (href.includes("?") ? "&" : "?") + `d=${depth}`) as Href);
    } else if (above > 0) {
        router.dismiss(above);
    }
}

export function isDeep(d: string | undefined): boolean {
    return Number(d) >= 2;
}

export function openTeam(number: number, name?: string | null, season?: number | null) {
    let query = [
        name ? `name=${encodeURIComponent(name)}` : "",
        season ? `season=${season}` : "",
    ].filter(Boolean);
    // A team's page reads its season once, so one showing another season is another page.
    open(
        `/team/${number}` + (query.length ? `?${query.join("&")}` : ""),
        (p) =>
            p.name == "team/[number]" &&
            param(p, "number") == String(number) &&
            (!season || Number(p.params?.season ?? settings.get().season) == season)
    );
}

export function openEvent(season: number, code: string, name?: string | null) {
    open(
        `/event/${season}/${code}` + (name ? `?name=${encodeURIComponent(name)}` : ""),
        (p) =>
            p.name == "event/[season]/[code]" &&
            param(p, "season") == String(season) &&
            param(p, "code") == code
    );
}

export function openSearch() {
    open("/search", (p) => p.name == "search");
}

export function openSettings() {
    open("/settings", (p) => p.name == "settings");
}

export function goHome() {
    if (router.canDismiss()) router.dismissAll();
    else router.replace("/");
}

export function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/");
}

export function teamTitle(number: number | string, name?: string | null): string {
    return name ? `${number} - ${name}` : `Team ${number}`;
}
