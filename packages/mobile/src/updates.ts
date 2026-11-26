import * as Updates from "expo-updates";
import { AppState } from "react-native";

// Next to expo-update auto update checker also check for updates regularly and if an update is
// apply on refetch (pull down, refresh symbol) on the home page

export const RECHECK_MS = 30 * 60_000;

const enabled = () => Updates.isEnabled && !__DEV__;

let lastCheck = Date.now();
let running: Promise<boolean> | null = null;
let ready = false;

export function fetchUpdate(): Promise<boolean> {
    if (!enabled()) return Promise.resolve(false);
    if (ready) return Promise.resolve(true);
    running ??= (async () => {
        lastCheck = Date.now();
        try {
            let check = await Updates.checkForUpdateAsync();
            if (!check.isAvailable) return false;
            ready = (await Updates.fetchUpdateAsync()).isNew;
            return ready;
        } catch {
            // Offline or the update server is down: the next check tries again.
            return false;
        } finally {
            running = null;
        }
    })();
    return running;
}

let wired = false;

export function wireUpdates() {
    if (wired || !enabled()) return;
    wired = true;
    AppState.addEventListener("change", (state) => {
        if (state == "active" && Date.now() - lastCheck >= RECHECK_MS) fetchUpdate();
    });
}

// The home page's pull to refresh
export function useRefreshWithUpdate(refetch: () => Promise<unknown>): () => Promise<unknown> {
    let { isUpdatePending } = Updates.useUpdates();
    return async () => {
        if (enabled() && (isUpdatePending || ready)) {
            try {
                return await Updates.reloadAsync();
            } catch {
                // Not restarted: refresh the page as usual.
            }
        }
        fetchUpdate();
        return refetch();
    };
}
