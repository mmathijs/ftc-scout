import { storage } from "@/storage";

const PREFIX = "q:";
const INDEX_KEY = "q-index";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 400;

let index: Record<string, number> | null = null;

function loadIndex(): Record<string, number> {
    if (index) return index;
    let idx: Record<string, number> = {};
    try {
        let parsed: unknown = JSON.parse(storage.get(INDEX_KEY) ?? "{}");
        if (parsed && typeof parsed == "object" && !Array.isArray(parsed)) {
            for (let [key, at] of Object.entries(parsed)) {
                if (typeof at == "number" && Number.isFinite(at)) idx[key] = at;
            }
        }
    } catch {}
    index = idx;
    return idx;
}

function writeIndex(): Promise<boolean> {
    return storage.set(INDEX_KEY, JSON.stringify(loadIndex()));
}

function dropOldest(count: number): number {
    let idx = loadIndex();
    let oldest = Object.entries(idx)
        .sort((a, b) => a[1] - b[1])
        .slice(0, count);
    for (let [key] of oldest) {
        storage.remove(PREFIX + key);
        delete idx[key];
    }
    return oldest.length;
}

// Favourites and settings are stored with this too, so they can push saved pages out.
export async function setMakingRoom(key: string, value: string): Promise<boolean> {
    if (await storage.set(key, value)) return true;
    pruneCache();
    for (;;) {
        if (await storage.set(key, value)) return true;
        if (!dropOldest(Math.ceil(Object.keys(loadIndex()).length / 4))) return false;
        await writeIndex();
    }
}

// When an entry was saved, if it is young enough to be read. Only the index is looked at.
export function cachedAt(key: string): number | undefined {
    let at = loadIndex()[key];
    return at != undefined && Date.now() - at <= MAX_AGE_MS ? at : undefined;
}

export function readCached<T>(key: string): T | undefined {
    if (cachedAt(key) == undefined) return undefined;
    try {
        let data = JSON.parse(storage.get(PREFIX + key) ?? "null");
        if (data && typeof data == "object") return data as T;
    } catch {}
    // Gone or damaged, so it isn't read again.
    dropCached((k) => k == key);
    return undefined;
}

export async function writeCached(
    key: string,
    data: unknown,
    at: number = Date.now()
): Promise<boolean> {
    try {
        let value = JSON.stringify(data);
        if (value == undefined || value.length > storage.maxLength) return false;
        if (!(await setMakingRoom(PREFIX + key, value))) return false;
        loadIndex()[key] = at;
        for (;;) {
            if (await writeIndex()) return true;
            if (!dropOldest(Math.ceil(Object.keys(loadIndex()).length / 4))) return false;
        }
    } catch {
        return false;
    }
}

export function pruneCache(
    now: number = Date.now(),
    current: (key: string) => boolean = () => true
) {
    let idx = loadIndex();
    let stored = new Set<string>();
    for (let k of storage.keys()) {
        if (k.startsWith(PREFIX)) stored.add(k.slice(PREFIX.length));
    }
    let lines = Object.keys(idx).length;
    let keep = new Set<string>();
    Object.entries(idx)
        .filter(([key, at]) => stored.has(key) && now - at <= MAX_AGE_MS && current(key))
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_ENTRIES)
        .forEach(([key]) => keep.add(key));
    for (let key of Object.keys(idx)) {
        if (!keep.has(key)) delete idx[key];
    }
    for (let key of stored) {
        if (!keep.has(key)) storage.remove(PREFIX + key);
    }
    if (keep.size != lines) void writeIndex();
}

export function dropCached(match: (key: string) => boolean) {
    let idx = loadIndex();
    let dropped = false;
    for (let key of Object.keys(idx)) {
        if (!match(key)) continue;
        storage.remove(PREFIX + key);
        delete idx[key];
        dropped = true;
    }
    if (dropped) void writeIndex();
}

export function clearCache() {
    for (let k of storage.keys()) {
        if (k.startsWith(PREFIX)) storage.remove(k);
    }
    index = {};
    void writeIndex();
}

export function cacheEntryCount(): number {
    return Object.keys(loadIndex()).length;
}
