import { onlineManager } from "@tanstack/react-query";
import { useLocalSearchParams, useRoute, type ErrorBoundaryProps } from "expo-router";
import { useSyncExternalStore } from "react";
import { View } from "react-native";
import { ApiError, isRefusal } from "@/api/client";
import { forgetSaved } from "@/api/hooks";
import { queryClient } from "@/api/queryClient";
import { savedAt } from "@/format";
import { useTheme } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";
import { Button } from "./Button";
import { Card } from "./Card";
import { Icon, type IconName } from "./Icon";
import { Txt } from "./Txt";

// The same functions on every render, so useSyncExternalStore doesn't resubscribe each time.
const isOnline = () => onlineManager.isOnline();

export function useOnline(): boolean {
    return useSyncExternalStore(onlineManager.subscribe, isOnline, () => true);
}

export function ErrorView({
    error,
    onRetry,
    what = "this page",
    message: said,
}: {
    error: unknown;
    onRetry?: () => void;
    what?: string;
    message?: string;
}) {
    let c = useTheme();
    let online = useOnline();
    let offline = !online && said == undefined;
    let message =
        said ??
        (offline
            ? `You're offline, and nothing is saved on this phone for ${what} yet.`
            : error instanceof ApiError && error.message
            ? error.message
            : "The FTCScout server couldn't be reached. Check your connection and try again.");
    let retry = isRefusal(error) ? undefined : onRetry;
    return (
        <Card>
            <View style={{ alignItems: "center", gap: space.md, paddingVertical: space.lg }}>
                <Icon
                    name={offline ? "plane-slash" : "triangle-exclamation"}
                    size={32}
                    color={c.textSecondary}
                />
                <Txt size="lg" weight="semibold" center>
                    {offline ? "No connection" : `Couldn't load ${what}`}
                </Txt>
                <Txt dim center>
                    {message}
                </Txt>
                {retry ? (
                    <Button label="Try again" icon="rotate-right" onPress={retry} primary />
                ) : null}
            </View>
        </Card>
    );
}

// Retrying forgets what was saved for the page, in case that is what it failed on.
export function ScreenError({ error, retry }: ErrorBoundaryProps) {
    let c = useTheme();
    let route = useRoute();
    let params = useLocalSearchParams();
    return (
        <View style={{ flex: 1, backgroundColor: c.bg }}>
            <ErrorView
                error={error}
                message="Something went wrong while showing this page. Trying again loads it afresh."
                onRetry={() => {
                    forgetSaved(queryClient, route.name, params);
                    retry();
                }}
            />
        </View>
    );
}

const clip = (text: string) => (text.length > 24 ? text.slice(0, 24) + "…" : text);

export function NoTeam({ number }: { number: number | string }) {
    return (
        <EmptyView
            icon="hashtag"
            title={`No team with number ${clip(String(number))}`}
            text="Try searching for teams on the Teams tab."
        />
    );
}

export function NoEvent({ season, code }: { season: number | string; code: string }) {
    return (
        <EmptyView
            icon="calendar-xmark"
            title="Event not found"
            text={`There is no ${clip(String(season))} event with the code ${clip(code)}.`}
        />
    );
}

export function EmptyView({
    icon = "circle-info",
    title,
    text,
}: {
    icon?: IconName;
    title: string;
    text?: string;
}) {
    let c = useTheme();
    return (
        <View style={{ alignItems: "center", gap: space.sm, padding: space.xl }}>
            <Icon name={icon} size={28} color={c.textSecondary} />
            <Txt size="lg" weight="semibold" center>
                {title}
            </Txt>
            {text ? (
                <Txt dim center>
                    {text}
                </Txt>
            ) : null}
        </View>
    );
}

export function SavedNote({ updatedAt, failed }: { updatedAt: number; failed: boolean }) {
    let c = useTheme();
    let online = useOnline();
    if (online && !failed) return null;
    if (!updatedAt) return null;
    return (
        <View
            accessibilityRole="alert"
            style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.sm,
                backgroundColor: c.alert,
                paddingHorizontal: space.md,
                paddingVertical: space.sm,
            }}
        >
            <Icon
                name={online ? "triangle-exclamation" : "plane-slash"}
                size={13}
                color={c.onAlert}
            />
            <Txt size="sm" weight="semibold" color={c.onAlert} style={{ flex: 1 }}>
                {online ? "Couldn't refresh" : "Offline"} · saved {savedAt(updatedAt)}
            </Txt>
        </View>
    );
}
