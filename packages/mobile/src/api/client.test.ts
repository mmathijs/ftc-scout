import { ApiError, isRefusal, RefusalError, request, TimeoutError } from "./client";
import type { Doc } from "./generated/documents";

const doc: Doc<{ n: number }, { season: number }> = {
    name: "Thing",
    kind: "query",
    hash: "abc123",
    query: "query Thing($season:Int!){n(season:$season)}",
};

function res(status: number, body: unknown, headers: Record<string, string> = {}) {
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
        text: async () => (typeof body == "string" ? body : JSON.stringify(body)),
    } as unknown as Response;
}

const notFound = {
    errors: [
        { message: "PersistedQueryNotFound", extensions: { code: "PERSISTED_QUERY_NOT_FOUND" } },
    ],
};

describe("request", () => {
    it("asks by hash with a GET and never sends the query text when the API knows it", async () => {
        let f = jest.fn(async () => res(200, { data: { n: 1 } }));
        await expect(request(doc, { season: 2025 }, { fetch: f as any })).resolves.toEqual({
            n: 1,
        });
        expect(f).toHaveBeenCalledTimes(1);
        let [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
        expect(init.method).toBeUndefined();
        expect(url).toContain("operationName=Thing");
        expect(decodeURIComponent(url)).toContain('"sha256Hash":"abc123"');
        expect(decodeURIComponent(url)).toContain('{"season":2025}');
        expect(url).not.toContain("query%20Thing");
        expect((init.headers as any)["content-type"]).toBe("application/json");
    });

    it("sends the text once when the API doesn't know the hash", async () => {
        let f = jest
            .fn()
            .mockResolvedValueOnce(res(200, notFound))
            .mockResolvedValueOnce(res(200, { data: { n: 2 } }));
        await expect(request(doc, { season: 2025 }, { fetch: f as any })).resolves.toEqual({
            n: 2,
        });
        let [, init] = f.mock.calls[1] as [string, RequestInit];
        expect(init.method).toBe("POST");
        let sent = JSON.parse(init.body as string);
        expect(sent.query).toBe(doc.query);
        expect(sent.extensions.persistedQuery.sha256Hash).toBe("abc123");
    });

    it("waits and retries once when rate limited", async () => {
        let f = jest
            .fn()
            .mockResolvedValueOnce(res(429, "", { "retry-after": "0.01" }))
            .mockResolvedValueOnce(res(200, { data: { n: 3 } }));
        await expect(request(doc, { season: 2025 }, { fetch: f as any })).resolves.toEqual({
            n: 3,
        });
        expect(f).toHaveBeenCalledTimes(2);
    });

    it("gives up when still rate limited", async () => {
        let f = jest.fn(async () => res(429, "", { "retry-after": "0.01" }));
        await expect(request(doc, { season: 2025 }, { fetch: f as any })).rejects.toMatchObject({
            status: 429,
            message: "Too many requests. Try again in a moment.",
        });
    });

    it("waits out a rate limit on sending the query text too", async () => {
        let f = jest
            .fn()
            .mockResolvedValueOnce(res(200, notFound))
            .mockResolvedValueOnce(res(429, "", { "retry-after": "0.01" }))
            .mockResolvedValueOnce(res(200, { data: { n: 4 } }));
        await expect(request(doc, { season: 2025 }, { fetch: f as any })).resolves.toEqual({
            n: 4,
        });
        let methods = f.mock.calls.map(([, init]) => (init as RequestInit).method ?? "GET");
        expect(methods).toEqual(["GET", "POST", "POST"]);
    });

    it("stops waiting out a rate limit when the caller stops it", async () => {
        let ctl = new AbortController();
        let f = jest.fn(async () => res(429, "", { "retry-after": "5" }));
        let pending = request(doc, { season: 2025 }, { fetch: f as any, signal: ctl.signal });
        await new Promise((r) => setTimeout(r, 10));
        let started = Date.now();
        ctl.abort();
        await expect(pending).rejects.toThrow("Aborted");
        expect(Date.now() - started).toBeLessThan(1000);
        expect(f).toHaveBeenCalledTimes(1);
    });

    it("says in plain words that the API failed when it answers 200 with errors", async () => {
        let said = 'relation "team_event_participation_2026" does not exist';
        for (let body of [
            { errors: [{ message: said }] },
            { errors: [{ message: said }], data: { n: 1 } },
        ]) {
            let f = jest.fn(async () => res(200, body));
            let e = await request(doc, { season: 2025 }, { fetch: f as any }).catch((e) => e);
            expect(e.message).toBe("The FTCScout server has a problem. Try again later.");
            expect([e.status, e.detail, isRefusal(e)]).toEqual([200, said, false]);
        }
    });

    it("does not show the hash being unknown when sending the text fails the same way", async () => {
        let f = jest.fn(async () => res(200, notFound));
        let e = await request(doc, { season: 2025 }, { fetch: f as any }).catch((e) => e);
        expect(f).toHaveBeenCalledTimes(2);
        expect(e.message).toBe("The FTCScout server has a problem. Try again later.");
        expect(e.detail).toBe("PersistedQueryNotFound");
    });

    it("says that an answer could not be read, whatever is wrong with it", async () => {
        for (let body of ["<html>", "", "null", "5", "{}", '{"data":null}']) {
            let f = jest.fn(async () => res(200, body));
            let e = await request(doc, { season: 2025 }, { fetch: f as any }).catch((e) => e);
            expect(e).toBeInstanceOf(ApiError);
            expect([body, e.message]).toEqual([
                body,
                "The FTCScout server's answer could not be read. Try again.",
            ]);
            expect(isRefusal(e)).toBe(false);
        }
        let f = jest.fn(async () => res(200, '{"errors":"boom"}'));
        let e = await request(doc, { season: 2025 }, { fetch: f as any }).catch((e) => e);
        expect(e.message).toBe("The FTCScout server has a problem. Try again later.");
    });

    it("lets a block page be tried again", async () => {
        let f = jest.fn(async () => res(403, "<html>CrowdSec Ban</html>"));
        let e = await request(doc, { season: 2025 }, { fetch: f as any }).catch((e) => e);
        expect(e.message).toBe(
            "The FTCScout server did not answer this request. Try again in a moment."
        );
        expect([e.status, isRefusal(e)]).toEqual([403, false]);
    });

    it("says in plain words that the API has a problem of its own", async () => {
        let f = jest.fn(async () => res(500, { errors: [{ message: "pq: deadlock detected" }] }));
        let e = await request(doc, { season: 2025 }, { fetch: f as any }).catch((e) => e);
        expect(e.message).toBe("The FTCScout server has a problem. Try again later.");
        expect([e.status, e.detail, isRefusal(e)]).toEqual([500, "pq: deadlock detected", false]);
    });

    it("reports an answer that isn't JSON", async () => {
        let f = jest.fn(async () => res(502, "<html>Bad gateway</html>"));
        let e = await request(doc, { season: 2025 }, { fetch: f as any }).catch((e) => e);
        expect(e).toBeInstanceOf(ApiError);
        expect(e.status).toBe(502);
        expect(e.message).toBe("The FTCScout server has a problem. Try again later.");
    });

    it("says in plain words that the API turned a request down, and keeps what it said", async () => {
        let said = 'Variable "$number" got invalid value 3954.5; Failed to parse "Int"';
        let f = jest.fn(async () => res(400, { errors: [{ message: said }] }));
        let e = await request(doc, { season: 2025 }, { fetch: f as any }).catch((e) => e);
        expect(e).toBeInstanceOf(ApiError);
        expect(e.message).toBe("The FTCScout server could not answer this request.");
        expect([e.status, e.detail]).toEqual([400, said]);
        expect(isRefusal(e)).toBe(true);
    });

    it("gives up a request that hangs, whether or not the request can be aborted", async () => {
        let aborted = false;
        let hangs = jest.fn(
            (_url: string, init: RequestInit) =>
                new Promise<Response>((_, reject) => {
                    init.signal!.addEventListener("abort", () => {
                        aborted = true;
                        reject(new Error("Aborted"));
                    });
                })
        );
        let opts = { fetch: hangs as any, timeoutMs: 20 };
        await expect(request(doc, { season: 2025 }, opts)).rejects.toThrow("took too long");
        expect(aborted).toBe(true);
        let deaf = { fetch: (() => new Promise(() => {})) as any, timeoutMs: 20 };
        let e = await request(doc, { season: 2025 }, deaf).catch((e) => e);
        expect(e).toBeInstanceOf(TimeoutError);
        expect(isRefusal(e)).toBe(false);
    });

    it("gives up an answer whose body never ends", async () => {
        let f = jest.fn(async () => ({ ...res(200, ""), text: () => new Promise(() => {}) }));
        await expect(
            request(doc, { season: 2025 }, { fetch: f as any, timeoutMs: 20 })
        ).rejects.toThrow("took too long");
    });

    it("stops when the caller stops it", async () => {
        let ctl = new AbortController();
        let f = jest.fn(
            (_url: string, init: RequestInit) =>
                new Promise<Response>((_, reject) => {
                    init.signal!.addEventListener("abort", () => reject(new Error("Aborted")));
                })
        );
        let pending = request(doc, { season: 2025 }, { fetch: f as any, signal: ctl.signal });
        ctl.abort();
        await expect(pending).rejects.toThrow("Aborted");
    });
});

describe("isRefusal", () => {
    it("is only for what the API itself turned down", () => {
        expect(isRefusal(new RefusalError("", 400))).toBe(true);
        for (let status of [null, 400, 403, 404, 408, 429, 500, 502]) {
            expect(isRefusal(new ApiError("", status))).toBe(false);
        }
        expect(isRefusal(new TypeError("Failed to fetch"))).toBe(false);
    });
});
