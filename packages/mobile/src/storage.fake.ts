export function fakeStorage(quota = Infinity) {
    let data = new Map<string, string>();
    let used = (without?: string) => {
        let n = 0;
        for (let [k, v] of data) if (k != without) n += k.length + v.length;
        return n;
    };
    return {
        data,
        quota,
        maxLength: Infinity,
        get: (k: string) => data.get(k) ?? null,
        set(k: string, v: string): Promise<boolean> {
            if (used(k) + k.length + v.length > this.quota) return Promise.resolve(false);
            data.set(k, v);
            return Promise.resolve(true);
        },
        remove: (k: string) => void data.delete(k),
        keys: () => [...data.keys()],
    };
}
