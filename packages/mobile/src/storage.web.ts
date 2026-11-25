export const storage = {
    // A browser gives a site about five million characters, which the search data alone would take.
    maxLength: 1_000_000,
    get(key: string): string | null {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    },
    set(key: string, value: string): Promise<boolean> {
        try {
            localStorage.setItem(key, value);
            return Promise.resolve(true);
        } catch {
            return Promise.resolve(false);
        }
    },
    remove(key: string): void {
        try {
            localStorage.removeItem(key);
        } catch {}
    },
    keys(): string[] {
        try {
            return Object.keys(localStorage);
        } catch {
            return [];
        }
    },
};
