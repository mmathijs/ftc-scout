import type { EventType } from "@ftc-scout/common";
import { memo } from "react";
import { View } from "react-native";
import {
    localDay,
    locationString,
    prettyPrintEventTypeShort,
    prettyPrintRegionCode,
    type Location,
} from "@/format";
import { openEvent, openTeam } from "@/nav";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space, TAP } from "@/theme/tokens";
import { Badge } from "./Badge";
import { Icon, type IconName } from "./Icon";
import { Press } from "./Pressable";
import { Txt } from "./Txt";

export const TeamRow = memo(function TeamRow({
    number,
    name,
    location,
    season,
}: {
    season?: number;
    number: number;
    name: string;
    location?: Location | null;
}) {
    let place = locationString(location);
    return (
        <Press
            onPress={() => openTeam(number, name, season)}
            accessibilityRole="link"
            accessibilityLabel={`Team ${number} ${name}` + (place ? `, ${place}` : "")}
            style={{
                minHeight: 56,
                flexDirection: "row",
                alignItems: "center",
                gap: space.sm,
                borderRadius: radius.sm,
            }}
        >
            <View style={{ minWidth: 64, alignItems: "center" }}>
                <Txt size="lg" tabular numberOfLines={1}>
                    {number}
                </Txt>
            </View>
            <View style={{ flex: 1 }}>
                <Txt numberOfLines={1}>{name}</Txt>
                {place ? (
                    <Txt size="sm" italic dim numberOfLines={1}>
                        {place}
                    </Txt>
                ) : null}
            </View>
        </Press>
    );
});

export type EventRowData = {
    season: number;
    code: string;
    name: string;
    start: string;
    end: string;
    type?: EventType | null;
    regionCode?: string | null;
    remote?: boolean;
    hasMatches?: boolean;
    location?: Location | null;
};

export const EventRow = memo(function EventRow({ event }: { event: EventRowData }) {
    let c = useTheme();
    let dim = event.hasMatches === false && !!event.end && event.end < localDay();
    // What the colours say, for screen readers.
    let label = event.name + (event.remote ? ", remote" : "") + (dim ? ", no matches" : "");
    return (
        <Press
            onPress={() => openEvent(event.season, event.code, event.name)}
            accessibilityRole="link"
            accessibilityLabel={label}
            style={{
                minHeight: TAP,
                flexDirection: "row",
                alignItems: "center",
                gap: space.sm,
                paddingHorizontal: space.xs,
                borderRadius: radius.sm,
            }}
        >
            <Txt color={dim ? c.textMuted : c.text} numberOfLines={2} style={{ flex: 1 }}>
                {event.name}
            </Txt>
            {event.type ? (
                <Badge
                    label={prettyPrintEventTypeShort(event.type)}
                    kind={event.remote ? "remote" : "type"}
                />
            ) : null}
            {event.regionCode ? (
                <Badge label={prettyPrintRegionCode(event.regionCode)} kind="region" />
            ) : null}
        </Press>
    );
});

export function InfoRow({
    icon,
    children,
    onPress,
    label,
}: {
    icon: IconName;
    children: React.ReactNode;
    onPress?: () => void;
    label?: string;
}) {
    let row = (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.sm,
                minHeight: onPress ? 36 : 26,
            }}
        >
            <View style={{ width: 20, alignItems: "center" }}>
                <Icon name={icon} size={14} />
            </View>
            <View style={{ flex: 1 }}>{children}</View>
        </View>
    );
    if (!onPress) return row;
    return (
        <Press
            onPress={onPress}
            accessibilityRole="link"
            accessibilityLabel={label}
            hitSlop={{ top: 4, bottom: 4 }}
        >
            {row}
        </Press>
    );
}

export function DataFromFirst() {
    return (
        <InfoRow icon="circle-check">
            <Txt>
                Data from <Txt italic>FIRST</Txt>
            </Txt>
        </InfoRow>
    );
}

export function GroupHeading({ title, detail }: { title: string; detail?: string }) {
    let c = useTheme();
    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: space.sm,
                minHeight: 34,
                paddingHorizontal: space.sm,
                backgroundColor: c.raised,
                borderRadius: radius.md,
            }}
        >
            <Txt
                size="lg"
                weight="semibold"
                accessibilityRole="header"
                style={{ flexShrink: 1 }}
                numberOfLines={1}
            >
                {title}
            </Txt>
            {detail ? (
                <Txt size="sm" italic numberOfLines={1}>
                    {detail}
                </Txt>
            ) : null}
        </View>
    );
}
