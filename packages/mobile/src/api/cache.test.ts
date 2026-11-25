jest.mock("@/storage", () => ({ storage: require("@/storage.fake").fakeStorage() }));

import { storage } from "@/storage";

const fake = storage as unknown as ReturnType<typeof import("@/storage.fake").fakeStorage>;
const DAY = 24 * 60 * 60 * 1000;

function start(stored: Record<string, string> = {}, quota = Infinity): typeof import("./cache") {
    fake.data.clear();
    fake.quota = quota;
    fake.maxLength = Infinity;
    for (let [k, v] of Object.entries(stored)) fake.data.set(k, v);
    let mod: typeof import("./cache");
    jest.isolateModules(() => (mod = require("./cache")));
    return mod!;
}

const index = () => JSON.parse(storage.get("q-index")!);
const entries = () =>
    storage
        .keys()
        .filter((k) => k.startsWith("q:"))
        .sort();

describe("the offline cache", () => {
    it("reads back what it saved, with its time", async () => {
        let cache = start();
        let at = Date.now() - 5;
        expect(await cache.writeCached("a", { n: 1 }, at)).toBe(true);
        expect(cache.readCached("a")).toEqual({ n: 1 });
        expect(cache.cachedAt("a")).toBe(at);
        let again = start({ ...Object.fromEntries(fake.data) });
        expect([again.readCached("a"), again.cachedAt("a")]).toEqual([{ n: 1 }, at]);
        expect([cache.readCached("b"), cache.cachedAt("b")]).toEqual([undefined, undefined]);
    });

    it("does not read an entry that is too old, damaged, or not an answer", () => {
        let now = Date.now();
        let cache = start({
            "q-index": JSON.stringify({ old: now - 31 * DAY, cut: now, nil: now, num: now }),
            "q:old": "{}",
            "q:cut": '{"teamByNumber":{"numb',
            "q:nil": "null",
            "q:num": "5",
        });
        for (let key of ["old", "cut", "nil", "num", "gone"]) {
            expect(cache.readCached(key)).toBeUndefined();
        }
        expect(cache.cachedAt("old")).toBeUndefined();
        // What is damaged is dropped, so it isn't parsed again.
        expect(cache.cacheEntryCount()).toBe(1);
        expect(storage.get("q:cut")).toBeNull();
    });

    it.each(['"x"', "5", "true", "null", "[]", "{broken", '{"a":"yesterday"}'])(
        "works with a damaged index (%s): nothing is read, and saving works again",
        async (bad) => {
            let cache = start({ "q-index": bad, "q:a": '{"n":0}' });
            expect(cache.readCached("a")).toBeUndefined();
            expect(await cache.writeCached("b", { n: 2 })).toBe(true);
            expect(cache.readCached("b")).toEqual({ n: 2 });
            expect(Object.keys(index())).toEqual(["b"]);
            cache.pruneCache();
            expect(entries()).toEqual(["q:b"]);
        }
    );

    it("makes room by dropping its oldest entries when the storage is full", async () => {
        let cache = start({}, 1200);
        let big = { text: "x".repeat(200) };
        let now = Date.now();
        for (let i = 0; i < 8; i++) await cache.writeCached("k" + i, big, now - 8000 + i);
        expect(cache.readCached("k7")).toBeDefined();
        expect(storage.get("q:k0")).toBeNull();
        expect(entries()).toEqual(
            Object.keys(index())
                .map((k) => "q:" + k)
                .sort()
        );
        expect(cache.cacheEntryCount()).toBe(entries().length);
        expect(entries().length).toBeGreaterThan(2);
    });

    it("has no line in the index for what could not be stored", async () => {
        let cache = start({ other: "x".repeat(1000) }, 1010);
        expect(await cache.writeCached("a", { text: "x".repeat(100) })).toBe(false);
        expect(cache.readCached("a")).toBeUndefined();
        expect(cache.cacheEntryCount()).toBe(0);
        expect(storage.get("other")).toHaveLength(1000);
    });

    it("does not try to store what the storage says is too long for it", async () => {
        let cache = start({}, 3000);
        await cache.writeCached("small", { n: 1 });
        fake.maxLength = 500;
        expect(await cache.writeCached("huge", { text: "x".repeat(5000) })).toBe(false);
        expect(cache.readCached("small")).toBeDefined();
    });

    it("never throws for what cannot be saved", async () => {
        let cache = start();
        let loop: any = {};
        loop.self = loop;
        await expect(cache.writeCached("a", loop)).resolves.toBe(false);
        await expect(cache.writeCached("b", undefined)).resolves.toBe(false);
    });

    it("drops saved pages to store a setting when the storage is full", async () => {
        let cache = start({}, 1500);
        let now = Date.now();
        for (let i = 0; i < 5; i++) {
            await cache.writeCached("k" + i, { text: "x".repeat(200) }, now - 5000 + i);
        }
        expect(await cache.setMakingRoom("favorites", "f".repeat(600))).toBe(true);
        expect(storage.get("favorites")).toHaveLength(600);
        expect(storage.get("q:k0")).toBeNull();
        expect(cache.readCached("k4")).toBeDefined();
    });

    it("prunes what is too old, what is over the limit, and what the index does not name", () => {
        let now = Date.now();
        let stored: Record<string, string> = {};
        let idx: Record<string, number> = {};
        for (let i = 0; i < 405; i++) {
            stored["q:n" + i] = "{}";
            idx["n" + i] = now - i * 1000;
        }
        stored["q:old"] = "{}";
        idx["old"] = now - 31 * DAY;
        stored["q:orphan"] = "{}";
        idx["lineOnly"] = now;
        stored["q:v1:x"] = "{}";
        idx["v1:x"] = now;
        stored["favorites"] = "{}";
        let cache = start({ ...stored, "q-index": JSON.stringify(idx) });
        cache.pruneCache(now, (key) => !key.startsWith("v1:"));

        expect(entries()).toHaveLength(400);
        expect(Object.keys(index())).toHaveLength(400);
        for (let gone of ["q:old", "q:orphan", "q:v1:x", "q:n400", "q:n404"]) {
            expect(storage.get(gone)).toBeNull();
        }
        expect(index().lineOnly).toBeUndefined();
        expect(storage.get("q:n399")).toBe("{}");
        expect(storage.get("favorites")).toBe("{}");
    });

    it("clears every saved page, named in the index or not, and nothing else", async () => {
        let cache = start({ "q:orphan": "{}", favorites: "{}", settings: "{}" });
        await cache.writeCached("a", { n: 1 });
        cache.clearCache();
        expect(entries()).toEqual([]);
        expect(cache.cacheEntryCount()).toBe(0);
        expect(cache.readCached("a")).toBeUndefined();
        expect(storage.keys().sort()).toEqual(["favorites", "q-index", "settings"]);
    });

    it("drops the entries it is asked to", async () => {
        let cache = start();
        await cache.writeCached("team:1", { n: 1 });
        await cache.writeCached("team:2", { n: 2 });
        cache.dropCached((key) => key == "team:1");
        expect(cache.readCached("team:1")).toBeUndefined();
        expect(storage.get("q:team:1")).toBeNull();
        expect(cache.readCached("team:2")).toBeDefined();
        expect(Object.keys(index())).toEqual(["team:2"]);
    });
});
