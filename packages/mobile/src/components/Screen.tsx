import type { UseQueryResult } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";
import { Skeleton } from "./Skeleton";
import { ErrorView, SavedNote } from "./States";

export function useRefresh(refetch: () => Promise<unknown>): {
    refreshing: boolean;
    onRefresh: () => void;
} {
    let [refreshing, setRefreshing] = useState(false);
    return {
        refreshing,
        onRefresh: () => {
            setRefreshing(true);
            refetch().finally(() => setRefreshing(false));
        },
    };
}

export function Page({ children }: { children: ReactNode }) {
    let c = useTheme();
    return <View style={{ flex: 1, backgroundColor: c.bg }}>{children}</View>;
}

export function QueryGate<D>({
    query,
    what,
    children,
}: {
    query: UseQueryResult<D>;
    what: string;
    children: (data: D) => ReactNode;
}) {
    if (query.data === undefined) {
        if (query.isError)
            return <ErrorView error={query.error} onRetry={() => query.refetch()} what={what} />;
        return (
            <>
                <SavedNote updatedAt={0} failed={false} fetching={query.isFetching} />
                <Skeleton rows={4} />
                <Skeleton rows={10} title={false} />
            </>
        );
    }
    return (
        <>
            <SavedNote
                updatedAt={query.dataUpdatedAt}
                failed={query.isError}
                fetching={query.isFetching}
            />
            {children(query.data)}
        </>
    );
}

export function ScrollScreen<D>({
    query,
    what,
    children,
}: {
    query: UseQueryResult<D>;
    what: string;
    children: (data: D) => ReactNode;
}) {
    let c = useTheme();
    let refresh = useRefresh(query.refetch);
    return (
        <Page>
            <ScrollView
                contentContainerStyle={{ paddingBottom: space.xl }}
                refreshControl={
                    <RefreshControl
                        refreshing={refresh.refreshing}
                        onRefresh={refresh.onRefresh}
                        tintColor={c.accent}
                        colors={[c.accent]}
                    />
                }
            >
                <QueryGate query={query} what={what}>
                    {children}
                </QueryGate>
            </ScrollView>
        </Page>
    );
}
