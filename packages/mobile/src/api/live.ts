import { createClient, type Client } from "graphql-ws/client";
import { AppState } from "react-native";
import { API_ORIGIN } from "./config";
import type { Doc } from "./generated/documents";

let client: Client | null = null;

const reconnectListeners = new Set<() => void>();
const statusListeners = new Set<() => void>();

let connected = false;
let watched = 0;
let lost = false;
/** What has been watched, by query and variables. */
const seen = new Set<string>();

const KEEP_ALIVE_MS = 20_000;
const PONG_WAIT_MS = 10_000;
const ACK_WAIT_MS = 10_000;
const MAX_RESUBSCRIBE_MS = 30_000;

// Updates sent while the connection was down, or while nobody watched, aren't sent again, so
// listeners have to refetch.
export function onReconnect(listener: () => void): () => void {
    reconnectListeners.add(listener);
    return () => void reconnectListeners.delete(listener);
}

function missedUpdates() {
    reconnectListeners.forEach((l) => l());
}

export function isConnected(): boolean {
    return connected;
}

export function onConnection(listener: () => void): () => void {
    statusListeners.add(listener);
    return () => void statusListeners.delete(listener);
}

function setConnected(next: boolean) {
    if (connected == next) return;
    connected = next;
    statusListeners.forEach((l) => l());
}

function getClient(): Client {
    if (client) return client;
    let socket: WebSocket | null = null;
    let silent: ReturnType<typeof setTimeout> | undefined;
    client = createClient({
        url: API_ORIGIN.replace(/^http/, "ws") + "/graphql",
        lazy: true,
        lazyCloseTimeout: 3000,
        retryAttempts: Infinity,
        shouldRetry: () => true,
        // Randomised, so phones don't all reconnect at once after a server restart.
        retryWait: (retries) =>
            new Promise((r) =>
                setTimeout(r, Math.min(1000 * 2 ** retries, 30_000) * (0.5 + Math.random() / 2))
            ),
        // A connection that died silently (Wi-Fi to cellular, say) is only noticed by timeouts.
        connectionAckWaitTimeout: ACK_WAIT_MS,
        keepAlive: KEEP_ALIVE_MS,
        on: {
            connected: (s) => {
                socket = s as WebSocket;
                setConnected(true);
                // Not `wasRetry`: it isn't set after a close with code 1000, which also reconnects.
                if (lost) {
                    lost = false;
                    missedUpdates();
                }
            },
            closed: () => {
                clearTimeout(silent);
                socket = null;
                if (watched > 0) lost = true;
                setConnected(false);
            },
            ping: (received) => {
                if (received) return;
                clearTimeout(silent);
                let asked = socket;
                silent = setTimeout(() => {
                    // The client reconnects after this close code.
                    if (asked && asked.readyState == 1) asked.close(4408, "Request Timeout");
                }, PONG_WAIT_MS);
            },
            pong: (received) => {
                if (received) clearTimeout(silent);
            },
        },
    });
    // A socket the phone dropped in the background may not have closed yet, and would only be
    // noticed by the ping timing out: start a new one when the app comes back.
    let backgroundSince = 0;
    AppState.addEventListener("change", (state) => {
        if (state == "background") backgroundSince = Date.now();
        else if (state == "active" && backgroundSince) {
            if (connected && Date.now() - backgroundSince > KEEP_ALIVE_MS) client?.terminate();
            backgroundSince = 0;
        }
    });
    return client;
}

export function subscribe<Data, Variables>(
    doc: Doc<Data, Variables>,
    variables: Variables,
    onData: (data: Data) => void
): () => void {
    let stopped = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dispose = () => {};

    function start(again: boolean) {
        let ended = false;
        let end = () => {
            if (stopped || ended) return;
            ended = true;
            let wait = Math.min(2000 * 2 ** tries++, MAX_RESUBSCRIBE_MS);
            timer = setTimeout(() => start(true), wait);
        };
        dispose = getClient().subscribe<Data>(
            {
                query: doc.query,
                operationName: doc.name,
                variables: variables as Record<string, unknown>,
            },
            {
                next: (result) => {
                    tries = 0;
                    if (result.data) onData(result.data);
                },
                error: end,
                complete: end,
            }
        );
        // What was sent since this was last watched is missed: refetched now (once this returns, so
        // a listener added just after subscribing hears it too), or once connected.
        if (!again) return;
        if (connected) Promise.resolve().then(missedUpdates);
        else lost = true;
    }

    // Watched again when a page comes back into view, or after the server ended the subscription.
    let id = doc.name + JSON.stringify(variables);
    let again = seen.has(id);
    seen.add(id);
    // A connection lost while nobody watched missed nothing that a new watcher shows.
    if (watched++ == 0) lost = false;
    start(again);
    return () => {
        if (stopped) return;
        stopped = true;
        watched--;
        clearTimeout(timer);
        dispose();
    };
}
