import { focusManager, hashKey, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useIsFocused } from "expo-router";
import { useEffect, useSyncExternalStore } from "react";
import { NewMatchesDoc } from "@/api/generated/documents";
import type * as T from "@/api/generated/types";
import { eventKey, eventLeanKey } from "@/api/hooks";
import { isConnected, onConnection, onReconnect, subscribe } from "@/api/live";
import { mergeMatches, resultOf } from "./mergeMatches";

const SETTLE_MS = 5000;
/** Longer than the CDN caches an event response. */
const RECENT_MS = 2 * 60_000;
const POLL_MS = 60_000;
/** So a connection that keeps dropping doesn't refetch the event every second. */
const REFETCH_GAP_MS = 10_000;

type LiveMatch = NonNullable<T.NewMatchesSubscription["newMatches"]>[number];

// When each event was last fetched, kept from one visit of its page to the next.
const fetchedAt = new Map<string, number>();

// Merges an event's live matches into its cached queries until the returned function is called.
export function followEvent(client: QueryClient, season: number, code: string): () => void {
    let full = eventKey(season, code);
    let lean = eventLeanKey(season, code);
    let id = hashKey(full);
    let leanId = hashKey(lean);

    let mergeFull = (matches: LiveMatch[]) =>
        client.setQueryData<T.EventPageQuery>(full, (old) =>
            old?.eventByCode
                ? { ...old, eventByCode: mergeMatches(old.eventByCode, matches, true) }
                : old
        );
    let mergeLean = (matches: LiveMatch[]) =>
        client.setQueryData<T.EventPageLeanQuery>(lean, (old) =>
            old?.eventByCode
                ? { ...old, eventByCode: mergeMatches(old.eventByCode, matches, false) }
                : old
        );

    // The CDN can answer with the event as it was up to a minute ago, so recent live matches are
    // laid over every answer (a refetch, a refresh, the full query after the lean one) that doesn't
    // have them yet.
    let recent = new Map<number, { match: LiveMatch; at: number }>();
    let stopAnswers = client.getQueryCache().subscribe((e) => {
        if (e.type != "updated" || e.action.type != "success" || e.action.manual) return;
        let isFull = e.query.queryHash == id;
        if (!isFull && e.query.queryHash != leanId) return;
        if (isFull) fetchedAt.set(id, Date.now());

        let now = Date.now();
        for (let [matchId, r] of recent) if (now - r.at > RECENT_MS) recent.delete(matchId);
        let answer = e.query.state.data as T.EventPageQuery | T.EventPageLeanQuery | undefined;
        let had = new Map(answer?.eventByCode?.matches.map((m) => [m.id, m]));
        let missing = [...recent.values()]
            .map((r) => r.match)
            .filter((m) => !had.has(m.id) || resultOf(had.get(m.id)!) != resultOf(m));
        if (missing.length) (isFull ? mergeFull : mergeLean)(missing);
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    let refetch = (delayMs = 0) => {
        if (timer) return;
        let wait = Math.max(delayMs, (fetchedAt.get(id) ?? 0) + REFETCH_GAP_MS - Date.now());
        timer = setTimeout(() => {
            timer = undefined;
            fetchedAt.set(id, Date.now());
            // Without cancelling a fetch on its way, such as the one for the app coming back.
            void client.invalidateQueries({ queryKey: full }, { cancelRefetch: false });
            void client.invalidateQueries({ queryKey: lean }, { cancelRefetch: false });
        }, wait);
    };

    // Matches posted while nothing was listening (no connection, or the page away) aren't sent again.
    let stopReconnect = onReconnect(() => refetch());
    let poll = setInterval(() => {
        if (!isConnected()) refetch();
    }, POLL_MS);

    let stopLive = subscribe(NewMatchesDoc, { season, code }, (data) => {
        let incoming = data.newMatches;
        // A batch the server couldn't send is missed too.
        if (!incoming) return refetch();
        if (!incoming.length) return;
        let at = Date.now();
        for (let match of incoming) recent.set(match.id, { match, at });
        mergeFull(incoming);
        mergeLean(incoming);
        // Live matches don't carry everything (EPA, new teams' info), so refetch once a burst settles.
        refetch(SETTLE_MS);
    });

    return () => {
        clearTimeout(timer);
        clearInterval(poll);
        stopAnswers();
        stopReconnect();
        stopLive();
    };
}

/** Returns whether live updates are arriving: watching and connected. */
export function useLiveEvent(season: number, code: string, ongoing: boolean): boolean {
    let client = useQueryClient();
    let focused = useIsFocused();
    // The query client's focus follows the app's state (queryClient.ts).
    let active = useSyncExternalStore(
        (onChange) => focusManager.subscribe(onChange),
        () => focusManager.isFocused()
    );
    let watching = ongoing && focused && active;
    let connected = useSyncExternalStore(onConnection, isConnected, () => false);
    useEffect(
        () => (watching ? followEvent(client, season, code) : undefined),
        [watching, season, code, client]
    );
    return watching && connected;
}
