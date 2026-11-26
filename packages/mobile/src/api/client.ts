import { onlineManager } from "@tanstack/react-query";
import { apiUrl } from "./config";
import type { Doc } from "./generated/documents";

export class ApiError extends Error {
    constructor(
        message: string,
        public status: number | null = null,
        /** The API's own message, when `message` is the app's wording for it. */
        public detail?: string
    ) {
        super(message);
    }
}

export class TimeoutError extends ApiError {}

export class RefusalError extends ApiError {}

export function isRefusal(error: unknown): boolean {
    return error instanceof RefusalError;
}

const PROBLEM = "The FTCScout server has a problem. Try again later.";

// The API's messages are for programmers and proxies answer in HTML, so users get our own wording.
function failure(status: number, said?: string): ApiError {
    if (status == 429)
        return new ApiError("Too many requests. Try again in a moment.", status, said);
    if (status >= 500) return new ApiError(PROBLEM, status, said);
    if (status >= 400) {
        // Not a refusal: blocks that end by themselves are answered with a 4xx too.
        let message = "The FTCScout server did not answer this request. Try again in a moment.";
        return new ApiError(message, status, said);
    }
    return new ApiError("The FTCScout server's answer could not be read. Try again.", status, said);
}

type FetchFn = typeof fetch;

const NOT_FOUND = "PERSISTED_QUERY_NOT_FOUND";

const MAX_RETRY_AFTER_MS = 5000;

const TIMEOUT_MS = 15_000;

async function timed<R>(
    ms: number,
    outer: AbortSignal | undefined,
    run: (signal: AbortSignal) => Promise<R>
): Promise<R> {
    let ctl = new AbortController();
    let stop = () => ctl.abort();
    if (outer?.aborted) stop();
    else outer?.addEventListener("abort", stop);
    let timer: ReturnType<typeof setTimeout>;
    let late = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            reject(new TimeoutError("The FTCScout server took too long to answer."));
            stop();
        }, ms);
    });
    try {
        // Raced as well as aborted, since an abort doesn't always end the request.
        return await Promise.race([run(ctl.signal), late]);
    } finally {
        clearTimeout(timer!);
        outer?.removeEventListener("abort", stop);
    }
}

function extensions(doc: Doc<any, any>) {
    return { persistedQuery: { version: 1, sha256Hash: doc.hash } };
}

function queryUrl(doc: Doc<any, any>, variables: unknown): string {
    return (
        apiUrl("/graphql") +
        `?operationName=${encodeURIComponent(doc.name)}` +
        `&variables=${encodeURIComponent(JSON.stringify(variables ?? {}))}` +
        `&extensions=${encodeURIComponent(JSON.stringify(extensions(doc)))}`
    );
}

type Answer = {
    status: number;
    ok: boolean;
    res: Response;
    body: { data?: any; errors?: unknown };
};

function errorsOf(body: Answer["body"]): any[] {
    let errors = body.errors;
    return errors == null ? [] : Array.isArray(errors) ? errors : [errors];
}

type Options = { signal?: AbortSignal; fetch?: FetchFn; timeoutMs?: number };

function exchange(url: string, init: RequestInit, opts: Options): Promise<Answer> {
    let f = opts.fetch ?? fetch;
    return timed(opts.timeoutMs ?? TIMEOUT_MS, opts.signal, async (signal) => {
        let res = await f(url, { ...init, signal });
        // Any answer means the phone is online, whatever its network state says.
        onlineManager.setOnline(true);
        let body = {};
        if (res.status != 429) {
            let text = await res.text();
            try {
                body = JSON.parse(text);
            } catch {
                throw failure(res.status);
            }
            if (!body || typeof body != "object") throw failure(res.status);
        }
        return { status: res.status, ok: res.ok, res, body };
    });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        let stop = () => {
            clearTimeout(timer);
            reject(new Error("Aborted"));
        };
        let timer = setTimeout(() => {
            signal?.removeEventListener("abort", stop);
            resolve();
        }, ms);
        if (signal?.aborted) stop();
        else signal?.addEventListener("abort", stop);
    });
}

// A rate-limited request is sent once more after the wait the API asks for, up to a limit.
async function exchangeWaiting(url: string, init: RequestInit, opts: Options): Promise<Answer> {
    let answer = await exchange(url, init, opts);
    if (answer.status != 429) return answer;
    let after = Number(answer.res.headers.get("retry-after"));
    let wait = (Number.isFinite(after) && after > 0 ? after : 1) * 1000;
    await sleep(Math.min(wait, MAX_RETRY_AFTER_MS), opts.signal);
    answer = await exchange(url, init, opts);
    if (answer.status == 429) throw failure(429);
    return answer;
}

// A GET that names the query by the SHA-256 of the app's own printed query, which the CDN can
// cache. An unknown hash is sent again as a POST with the query text.
export async function request<Data, Variables>(
    doc: Doc<Data, Variables>,
    variables: Variables,
    opts: Options = {}
): Promise<Data> {
    // The content type tells the API this isn't a cross-site form post.
    let headers = { "content-type": "application/json", accept: "application/json" };

    let answer = await exchangeWaiting(queryUrl(doc, variables), { headers }, opts);
    if (
        errorsOf(answer.body).some(
            (e) => e?.extensions?.code == NOT_FOUND || e?.message == "PersistedQueryNotFound"
        )
    ) {
        let body = JSON.stringify({
            operationName: doc.name,
            variables: variables ?? {},
            query: doc.query,
            extensions: extensions(doc),
        });
        answer = await exchangeWaiting(apiUrl("/graphql"), { method: "POST", headers, body }, opts);
    }

    let { body, status } = answer;
    let errors = errorsOf(body);
    if (errors.length) {
        let said: string | undefined =
            typeof errors[0]?.message == "string" ? errors[0].message : undefined;
        if (status >= 400 && status < 500 && status != 408) {
            throw new RefusalError(
                "The FTCScout server could not answer this request.",
                status,
                said
            );
        }
        // Errors can come with a 200 too. Partial data isn't shown: pages expect a whole answer.
        throw status >= 400 ? failure(status, said) : new ApiError(PROBLEM, status, said);
    }
    if (!answer.ok || body.data == undefined) throw failure(status);
    return body.data as Data;
}
