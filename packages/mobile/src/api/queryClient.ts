import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
import * as Network from "expo-network";
import { AppState, Platform } from "react-native";
import { ApiError, TimeoutError } from "./client";

// A server's 408 is a timeout like any other, but what else it answers with a 4xx is not retried.
export function retryQuery(count: number, error: unknown): boolean {
    let status = error instanceof ApiError ? error.status : null;
    if (status != null && status >= 400 && status < 500 && status != 408) return false;
    return onlineManager.isOnline() && count < (error instanceof TimeoutError ? 1 : 2);
}

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            gcTime: 10 * 60_000,
            // Requests go out even when the phone says it's offline, since it can be wrong.
            networkMode: "always",
            retry: retryQuery,
            refetchOnReconnect: true,
        },
    },
});

let wired = false;

export function wireQueryClient() {
    if (wired) return;
    wired = true;

    if (Platform.OS != "web") {
        AppState.addEventListener("change", (state) => focusManager.setFocused(state == "active"));
    }

    onlineManager.setEventListener((setOnline) => {
        let report = (state: Network.NetworkState) => setOnline(state.isConnected !== false);
        // The listener only reports changes, so an app started offline has to ask.
        Network.getNetworkStateAsync()
            .then(report)
            .catch(() => {});
        let sub = Network.addNetworkStateListener(report);
        return () => sub.remove();
    });
}
