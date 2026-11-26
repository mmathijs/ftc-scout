import { onlineManager } from "@tanstack/react-query";
import { useLocalSearchParams, useRoute, type ErrorBoundaryProps } from "expo-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { View } from "react-native";
import { ApiError, isRefusal } from "@/api/client";
import { forgetSaved } from "@/api/hooks";
import { queryClient } from "@/api/queryClient";
import { useTheme } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";
import { Button } from "./Button";
import { Card } from "./Card";
import { Icon, type IconName } from "./Icon";
import { savedNote, SLOW_MS, type Note } from "./savedNote";
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

export function useSlow(busy: boolean, ms = SLOW_MS): boolean {
    let [slow, setSlow] = useState(false);
    useEffect(() => {
        if (!busy) return;
        let t = setTimeout(() => setSlow(true), ms);
        return () => {
            clearTimeout(t);
            setSlow(false);
        };
    }, [busy, ms]);
    return busy && slow;
}

const NOTE_ICONS: Record<Note["kind"], IconName> = {
    offline: "plane-slash",
    failed: "triangle-exclamation",
    slow: "hourglass-half",
};

export function SavedNote({
    updatedAt,
    failed,
    fetching = false,
}: {
    updatedAt: number;
    failed: boolean;
    fetching?: boolean;
}) {
    let c = useTheme();
    let online = useOnline();
    let slow = useSlow(fetching);
    let note = savedNote({ online, failed, slow, updatedAt });
    if (!note) return null;
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
            <Icon name={NOTE_ICONS[note.kind]} size={13} color={c.onAlert} />
            <Txt size="sm" weight="semibold" color={c.onAlert} style={{ flex: 1 }}>
                {note.text}
            </Txt>
        </View>
    );
}
