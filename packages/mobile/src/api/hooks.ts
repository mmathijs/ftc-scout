import { CURRENT_SEASON } from "@ftc-scout/common";
import {
    keepPreviousData,
    useInfiniteQuery,
    useQuery,
    type QueryClient,
    type UseQueryResult,
} from "@tanstack/react-query";
import { cachedAt, dropCached, pruneCache, readCached, writeCached } from "./cache";
import { request, TimeoutError } from "./client";
import { API_ORIGIN } from "./config";
import * as Docs from "./generated/documents";
import {
    CombinedSearchDoc,
    EventsSearchDoc,
    EventPageDoc,
    EventPageLeanDoc,
    HomePageDoc,
    MatchRecordsDoc,
    TeamDoc,
    TepRecordsDoc,
    type Doc,
} from "./generated/documents";
import type * as T from "./generated/types";
import { isSeason, isTeamNumber, seasonParam, teamNumberParam } from "./params";
import { retryQuery } from "./queryClient";

export function queryKey(doc: Doc<any, any>, variables: unknown): [string, unknown] {
    return [doc.name, variables];
}

const version = (doc: Doc<any, any>) => doc.hash.slice(0, 12);

// The server and the query's hash are in the key, so neither a build for another server nor an
// update that changes a query reads answers that aren't its own.
export function cacheKey(doc: Doc<any, any>, key: readonly unknown[]): string {
    return JSON.stringify([API_ORIGIN, version(doc), ...key]);
}

const VERSIONS = new Set(Object.values(Docs).map(version));

// The query name and variables of an answer this build saved, or null for one it doesn't read.
function parseCacheKey(key: string): [string, any] | null {
    try {
        let [origin, v, name, variables] = JSON.parse(key);
        return origin == API_ORIGIN && VERSIONS.has(v) && typeof name == "string"
            ? [name, variables]
            : null;
    } catch {
        return null;
    }
}

export function pruneSaved() {
    pruneCache(Date.now(), (key) => parseCacheKey(key) != null);
}

// The answers each page without route parameters shows.
const PAGE_DOCS: Record<string, Doc<any, any>[]> = {
    index: [HomePageDoc],
    events: [EventsSearchDoc],
    teams: [CombinedSearchDoc],
    search: [CombinedSearchDoc],
    records: [TepRecordsDoc, MatchRecordsDoc],
};

function pageAnswers(route: string, params: Record<string, unknown>) {
    if (route == "team/[number]") {
        let number = teamNumberParam(params.number);
        return (name: string, v: any) => name == TeamDoc.name && v?.number === number;
    }
    if (route == "event/[season]/[code]") {
        let season = seasonParam(params.season);
        let events = [EventPageDoc.name, EventPageLeanDoc.name];
        return (name: string, v: any) =>
            events.includes(name) && v?.season === season && v?.code === params.code;
    }
    let names = (PAGE_DOCS[route] ?? []).map((d) => d.name);
    return (name: string) => names.includes(name);
}

// Forgets what is saved for a page, on the phone and in memory, for when it failed to draw it.
export function forgetSaved(client: QueryClient, route: string, params: Record<string, unknown>) {
    let mine = pageAnswers(route, params);
    dropCached((key) => {
        let parsed = parseCacheKey(key);
        return parsed != null && mine(...parsed);
    });
    client.removeQueries({
        predicate: (q) => typeof q.queryKey[0] == "string" && mine(q.queryKey[0], q.queryKey[1]),
    });
}

type Options = {
    enabled?: boolean;
    staleTime?: number;
    gcTime?: number;
    retry?: (count: number, error: Error) => boolean;
    timeoutMs?: number;
};

// Asks the API, and saves the answer for the next time the page opens.
function fetchAndSave<Data, Variables>(
    doc: Doc<Data, Variables>,
    variables: Variables,
    timeoutMs?: number
) {
    let saved = cacheKey(doc, queryKey(doc, variables));
    return async ({ signal }: { signal: AbortSignal }) => {
        let data = await request(doc, variables, { signal, timeoutMs });
        void writeCached(saved, data);
        return data;
    };
}

// What was saved shows at once, and is refreshed when it is stale.
function useApiQuery<Data, Variables>(
    doc: Doc<Data, Variables>,
    variables: Variables,
    { timeoutMs, ...opts }: Options = {}
): UseQueryResult<Data> {
    let key = queryKey(doc, variables);
    let saved = cacheKey(doc, key);
    return useQuery({
        queryKey: key,
        queryFn: fetchAndSave(doc, variables, timeoutMs),
        initialData: () => readCached<Data>(saved),
        initialDataUpdatedAt: () => cachedAt(saved),
        ...opts,
    });
}

export function useHome(season: number) {
    return useApiQuery(HomePageDoc, { season });
}

export function useTeam(number: number, season: number) {
    return useApiQuery(
        TeamDoc,
        { number, season },
        { enabled: isTeamNumber(number) && isSeason(season) }
    );
}

export const eventKey = (season: number, code: string) => queryKey(EventPageDoc, { season, code });
export const eventLeanKey = (season: number, code: string) =>
    queryKey(EventPageLeanDoc, { season, code });

export type FullEvent = NonNullable<T.EventPageQuery["eventByCode"]>;
export type LeanEvent = NonNullable<T.EventPageLeanQuery["eventByCode"]>;

export function useEvent(season: number, code: string) {
    let valid = isSeason(season) && !!code;
    let full = useApiQuery(EventPageDoc, { season, code }, { enabled: valid });
    let lean = useApiQuery(
        EventPageLeanDoc,
        { season, code },
        { enabled: valid && full.data === undefined }
    );
    return { full, lean };
}

export type SearchData = T.CombinedSearchQuery;
export type SearchTeam = SearchData["teamsSearch"][number];
export type SearchEvent = SearchData["eventsSearch"][number];

const SEARCH: Options = {
    // Megabytes, so it is given longer to arrive, and a timeout isn't retried.
    timeoutMs: 60_000,
    retry: (count, error) => !(error instanceof TimeoutError) && retryQuery(count, error),
    staleTime: 10 * 60_000,
    gcTime: Infinity,
};

export function useSearchData(season: number, enabled = true): UseQueryResult<SearchData> {
    return useApiQuery(CombinedSearchDoc, { season }, { ...SEARCH, enabled });
}

export function useEvents(season: number) {
    return useApiQuery(EventsSearchDoc, { season }, { staleTime: 5 * 60_000 });
}

const RECORDS_PAGE = 50;

export type RecordsVars = {
    season: number;
    sortBy: string;
    sortDir: T.SortDir;
    region: T.RegionOption;
    type: T.EventTypeOption;
};

function recordsVariables(v: RecordsVars, skip: number) {
    return {
        ...v,
        skip,
        take: RECORDS_PAGE,
        filter: null,
        remote: "All" as T.RemoteOption,
        start: null,
        end: null,
    };
}

function useRecords<Data, Page extends { count: number; data: unknown[] }>(
    doc: Doc<Data, any>,
    v: RecordsVars,
    pick: (d: Data) => Page | null | undefined,
    enabled: boolean
) {
    let firstPage = cacheKey(doc, [doc.name, v, 0]);
    return useInfiniteQuery({
        queryKey: [doc.name, v],
        queryFn: async ({ pageParam, signal }) => {
            let data = await request(doc, recordsVariables(v, pageParam), { signal });
            if (pageParam == 0) void writeCached(firstPage, data);
            return data;
        },
        initialPageParam: 0,
        getNextPageParam: (last, pages) => {
            let page = pick(last);
            let loaded = pages.length * RECORDS_PAGE;
            return page && loaded < page.count ? loaded : undefined;
        },
        initialData: () => {
            let saved = readCached<Data>(firstPage);
            return saved ? { pages: [saved], pageParams: [0] } : undefined;
        },
        initialDataUpdatedAt: () => cachedAt(firstPage),
        placeholderData: keepPreviousData,
        // A refresh refetches every loaded page, so records aren't refreshed on focus.
        staleTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: (query) => query.state.status == "error",
        enabled,
    });
}

export function useTepRecords(v: RecordsVars, enabled = true) {
    return useRecords(TepRecordsDoc, v, (d) => d.tepRecords, enabled);
}

export function useMatchRecords(v: RecordsVars, enabled = true) {
    return useRecords(MatchRecordsDoc, v, (d) => d.matchRecords, enabled);
}

function prefetch<Data, Variables>(
    client: QueryClient,
    doc: Doc<Data, Variables>,
    variables: Variables,
    { timeoutMs, ...opts }: Options = {}
) {
    let key = queryKey(doc, variables);
    if (cachedAt(cacheKey(doc, key)) != undefined) return;
    client
        .prefetchQuery({ queryKey: key, queryFn: fetchAndSave(doc, variables, timeoutMs), ...opts })
        .catch(() => {});
}

// The Events and Teams tabs' lists, unless they are saved already.
export function prefetchTabs(client: QueryClient, season: number) {
    prefetch(client, EventsSearchDoc, { season });
    prefetch(client, CombinedSearchDoc, { season: CURRENT_SEASON }, SEARCH);
}
