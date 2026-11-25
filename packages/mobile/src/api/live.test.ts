import type { Doc } from "./generated/documents";

type Sink = { next(r: unknown): void; error(e: unknown): void; complete(): void };

let mockOn: Record<string, (...args: any[]) => void>;
let mockSubs: { variables: unknown; sink: Sink; disposed: boolean }[];
let mockAppState: (state: string) => void;
let mockTerminate: jest.Mock;

jest.mock("react-native", () => ({
    AppState: {
        addEventListener: (_: string, handler: (state: string) => void) => {
            mockAppState = handler;
            return { remove() {} };
        },
    },
}));

jest.mock("graphql-ws/client", () => ({
    createClient: (opts: { on: typeof mockOn }) => {
        mockOn = opts.on;
        return {
            terminate: (mockTerminate = jest.fn()),
            subscribe(payload: { variables: unknown }, sink: Sink) {
                let s = { variables: payload.variables, sink, disposed: false };
                mockSubs.push(s);
                return () => void (s.disposed = true);
            },
        };
    },
}));

const doc: Doc<{ n: number }, { code: string }> = {
    name: "NewMatches",
    kind: "subscription",
    hash: "abc",
    query: "subscription NewMatches($code:String!){n}",
};

function start() {
    mockSubs = [];
    let live: typeof import("./live");
    jest.isolateModules(() => (live = require("./live")));
    let refetched = jest.fn();
    live!.onReconnect(refetched);
    return { live: live!, refetched };
}

const socket = { readyState: 1, close: jest.fn() };
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("live updates", () => {
    afterEach(() => jest.useRealTimers());

    it("passes updates on, and says whether it is connected", () => {
        let { live } = start();
        let got = jest.fn();
        let status = jest.fn();
        live.onConnection(status);
        live.subscribe(doc, { code: "A" }, got);
        mockOn.connected(socket);
        expect(live.isConnected()).toBe(true);
        mockSubs[0].sink.next({ data: { n: 1 } });
        expect(got).toHaveBeenCalledWith({ n: 1 });
        mockOn.closed();
        expect(live.isConnected()).toBe(false);
        expect(status).toHaveBeenCalledTimes(2);
    });

    it("has listeners refetch when the connection comes back while watching", () => {
        let { live, refetched } = start();
        live.subscribe(doc, { code: "A" }, () => {});
        mockOn.connected(socket);
        expect(refetched).not.toHaveBeenCalled();
        mockOn.closed();
        mockOn.connected(socket);
        expect(refetched).toHaveBeenCalledTimes(1);
    });

    it("doesn't for a connection lost while nobody watched", () => {
        let { live, refetched } = start();
        let stop = live.subscribe(doc, { code: "A" }, () => {});
        mockOn.connected(socket);
        mockOn.closed();
        stop();
        live.subscribe(doc, { code: "B" }, () => {});
        mockOn.connected(socket);
        expect(refetched).not.toHaveBeenCalled();
    });

    it("has listeners refetch when something is watched again after a gap", async () => {
        let { live, refetched } = start();
        let stop = live.subscribe(doc, { code: "A" }, () => {});
        mockOn.connected(socket);
        stop();
        expect(mockSubs[0].disposed).toBe(true);

        // Back within the socket's linger: it is still open.
        stop = live.subscribe(doc, { code: "A" }, () => {});
        await settle();
        expect(refetched).toHaveBeenCalledTimes(1);
        stop();

        // Back after it closed: once it is open again.
        mockOn.closed();
        live.subscribe(doc, { code: "A" }, () => {});
        await settle();
        expect(refetched).toHaveBeenCalledTimes(1);
        mockOn.connected(socket);
        expect(refetched).toHaveBeenCalledTimes(2);
    });

    it("subscribes again when the server ends a subscription, and has listeners refetch", async () => {
        jest.useFakeTimers();
        let { live, refetched } = start();
        let stop = live.subscribe(doc, { code: "A" }, () => {});
        mockOn.connected(socket);
        mockSubs[0].sink.complete();
        jest.advanceTimersByTime(2000);
        expect(mockSubs).toHaveLength(2);
        await Promise.resolve();
        expect(refetched).toHaveBeenCalledTimes(1);

        stop();
        mockSubs[1].sink.error(new Error("gone"));
        jest.advanceTimersByTime(60_000);
        expect(mockSubs).toHaveLength(2);
    });

    it("closes a connection that stops answering pings, so it reconnects", () => {
        jest.useFakeTimers();
        let { live } = start();
        live.subscribe(doc, { code: "A" }, () => {});
        let s = { readyState: 1, close: jest.fn() };
        mockOn.connected(s);
        mockOn.ping(false);
        mockOn.pong(true);
        jest.advanceTimersByTime(20_000);
        expect(s.close).not.toHaveBeenCalled();
        mockOn.ping(false);
        jest.advanceTimersByTime(10_000);
        expect(s.close).toHaveBeenCalledWith(4408, "Request Timeout");
    });
    it("starts a new socket when the app comes back after a while in the background", () => {
        jest.useFakeTimers();
        let { live } = start();
        live.subscribe(doc, { code: "A" }, () => {});
        mockOn.connected(socket);
        mockAppState("background");
        jest.advanceTimersByTime(5_000);
        mockAppState("active");
        expect(mockTerminate).not.toHaveBeenCalled();
        mockAppState("background");
        jest.advanceTimersByTime(60_000);
        mockAppState("active");
        expect(mockTerminate).toHaveBeenCalledTimes(1);
    });
});
