jest.mock("@/storage", () => ({ storage: require("@/storage.fake").fakeStorage() }));
jest.mock("expo-router", () => ({ useIsFocused: () => true }));

const mockLive = {
    connected: true,
    send: null as ((data: unknown) => void) | null,
    reconnect: null as (() => void) | null,
};
jest.mock("@/api/live", () => ({
    isConnected: () => mockLive.connected,
    onConnection: () => () => {},
    onReconnect: (listener: () => void) => {
        mockLive.reconnect = listener;
        return () => (mockLive.reconnect = null);
    },
    subscribe: (_doc: unknown, _variables: unknown, onData: (data: unknown) => void) => {
        mockLive.send = onData;
        return () => (mockLive.send = null);
    },
}));

import { QueryClient } from "@tanstack/react-query";
import { eventKey, eventLeanKey } from "@/api/hooks";
import fixture from "./__fixtures__/qualifier.json";
import type { followEvent as FollowEvent } from "./useLiveEvent";

const event = fixture as any;
const last = event.matches[event.matches.length - 1];
const full = eventKey(event.season, event.code);
const lean = eventLeanKey(event.season, event.code);
// The event as the CDN can still serve it after the last match's score went out live.
const stale = {
    eventByCode: {
        ...event,
        matches: event.matches.map((m: any) => (m.id == last.id ? { ...m, scores: null } : m)),
    },
};

let client: QueryClient;
let stop: () => void;
let followEvent: typeof FollowEvent;

function start(seed: [readonly unknown[], unknown][]) {
    // Each test gets its own module, which remembers when it last fetched an event.
    jest.isolateModules(() => ({ followEvent } = require("./useLiveEvent")));
    client = new QueryClient();
    for (let [key, data] of seed) client.setQueryData(key, data);
    stop = followEvent(client, event.season, event.code);
}

// An answer from the server, unlike setQueryData.
function answer(key: readonly unknown[], data: unknown) {
    return client.fetchQuery({ queryKey: key, queryFn: async () => data, staleTime: 0 });
}

const lastScores = (key: readonly unknown[]) =>
    (client.getQueryData(key) as any).eventByCode.matches.find((m: any) => m.id == last.id).scores;

// Counts the refetches of the full event from now on.
function refetches() {
    let spy = jest.spyOn(client, "invalidateQueries");
    return () =>
        spy.mock.calls.filter(([f]) => JSON.stringify(f?.queryKey) == JSON.stringify(full)).length;
}

afterEach(() => {
    stop();
    client.clear();
    jest.useRealTimers();
});

describe("followEvent", () => {
    it("keeps a live match over an older answer after the connection comes back", async () => {
        start([[full, stale]]);
        mockLive.send!({ newMatches: [last] });
        expect(lastScores(full)).toEqual(last.scores);

        mockLive.reconnect!();
        await answer(full, stale);
        expect(lastScores(full)).toEqual(last.scores);
        let ranks = (client.getQueryData(full) as any).eventByCode.teams.map(
            (t: any) => t.stats?.rank
        );
        expect(ranks).toEqual(event.teams.map((t: any) => t.stats?.rank));
    });

    it("lays a live match over the full event when it arrives after the lean one", async () => {
        start([[lean, stale]]);
        mockLive.send!({ newMatches: [last] });
        expect(lastScores(lean)).toEqual(last.scores);

        await answer(full, stale);
        expect(lastScores(full)).toEqual(last.scores);
    });

    it("lets the server's answer stand once the live match is older than the CDN's", async () => {
        start([[full, stale]]);
        mockLive.send!({ newMatches: [last] });
        let later = Date.now() + 3 * 60_000;
        jest.spyOn(Date, "now").mockReturnValue(later);
        await answer(full, stale);
        jest.restoreAllMocks();
        expect(lastScores(full)).toBeNull();
    });

    it("keeps an answer's own copy of a live match it already has", async () => {
        start([[full, stale]]);
        mockLive.send!({ newMatches: [last] });
        // The answer's copy can carry more than the live one, such as a video.
        let video = { url: "https://example.com/v", title: null };
        let caughtUp = {
            eventByCode: {
                ...event,
                matches: event.matches.map((m: any) =>
                    m.id == last.id ? { ...m, videos: [video] } : m
                ),
            },
        };
        await answer(full, caughtUp);
        let match = (client.getQueryData(full) as any).eventByCode.matches.find(
            (m: any) => m.id == last.id
        );
        expect(match.videos).toEqual([video]);
    });

    it("treats a batch the server couldn't send as missed", () => {
        jest.useFakeTimers();
        start([[full, stale]]);
        let count = refetches();
        mockLive.send!({ newMatches: null });
        jest.advanceTimersByTime(0);
        expect(count()).toBe(1);
    });

    it("refetches while the connection is down, but not more than every ten seconds", () => {
        jest.useFakeTimers();
        start([[full, stale]]);
        let count = refetches();

        for (let i = 0; i < 5; i++) mockLive.reconnect!();
        jest.advanceTimersByTime(0);
        expect(count()).toBe(1);
        mockLive.reconnect!();
        jest.advanceTimersByTime(9_000);
        expect(count()).toBe(1);
        jest.advanceTimersByTime(1_000);
        expect(count()).toBe(2);

        mockLive.connected = false;
        jest.advanceTimersByTime(60_000);
        expect(count()).toBe(3);
        mockLive.connected = true;
        jest.advanceTimersByTime(60_000);
        expect(count()).toBe(3);
    });

    it("keeps to the gap when the page comes back to the event", () => {
        jest.useFakeTimers();
        start([[full, stale]]);
        let count = refetches();
        mockLive.reconnect!();
        jest.advanceTimersByTime(0);
        stop();

        stop = followEvent(client, event.season, event.code);
        mockLive.reconnect!();
        jest.advanceTimersByTime(5_000);
        expect(count()).toBe(1);
        jest.advanceTimersByTime(5_000);
        expect(count()).toBe(2);
    });

    it("stops listening when the page stops watching", () => {
        start([[full, stale]]);
        stop();
        expect(mockLive.send).toBeNull();
        expect(mockLive.reconnect).toBeNull();
    });
});
