import Storage from "expo-sqlite/kv-store";

// Reads are synchronous so a screen can show what was stored in its first frame.
export const storage = {
    maxLength: Infinity,
    get(key: string): string | null {
        try {
            return Storage.getItemSync(key);
        } catch {
            return null;
        }
    },
    set(key: string, value: string): Promise<boolean> {
        return Storage.setItem(key, value).then(
            () => true,
            () => false
        );
    },
    remove(key: string): void {
        Storage.removeItem(key).catch(() => {});
    },
    keys(): string[] {
        try {
            return Storage.getAllKeysSync();
        } catch {
            return [];
        }
    },
};
