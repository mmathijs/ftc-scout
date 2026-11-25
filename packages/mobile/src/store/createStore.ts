import { useSyncExternalStore } from "react";
import { setMakingRoom } from "@/api/cache";
import { storage } from "@/storage";

export function isPlainObject(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v == "object" && !Array.isArray(v);
}

// A value kept in storage. `load` makes it from what was stored, which can be anything: a value
// of an older version of the app, or a damaged one.
export function createStore<T>(
    key: string,
    initial: T,
    opts: { load: (stored: unknown) => T; save?: (value: T) => unknown }
) {
    let value: T = initial;
    let loaded = false;
    let listeners = new Set<() => void>();

    function load() {
        if (loaded) return;
        loaded = true;
        let raw = storage.get(key);
        if (raw == null) return;
        try {
            value = opts.load(JSON.parse(raw));
        } catch {}
    }

    function get(): T {
        load();
        return value;
    }

    function set(next: T | ((old: T) => T)) {
        load();
        value = typeof next == "function" ? (next as (old: T) => T)(value) : next;
        void setMakingRoom(key, JSON.stringify(opts.save ? opts.save(value) : value));
        listeners.forEach((l) => l());
    }

    function subscribe(l: () => void) {
        listeners.add(l);
        return () => listeners.delete(l);
    }

    // Named as a hook so the React compiler treats calls as hook calls rather than memoizing them.
    function useValue(): T {
        return useSyncExternalStore(subscribe, get, get);
    }

    return { get, set, useValue, subscribe };
}
