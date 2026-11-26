import * as WebBrowser from "expo-web-browser";
import { View } from "react-native";
import type { FullEvent, LeanEvent } from "@/api/hooks";
import { Card, CARD_MARGIN, Title } from "@/components/Card";
import { Press } from "@/components/Pressable";
import { DataFromFirst, InfoRow } from "@/components/Rows";
import { Txt } from "@/components/Txt";
import { delayColor } from "@/features/matches/MatchRow";
import {
    dateFromStr,
    formatDelay,
    locationString,
    mapsUrl,
    prettyPrintDateRangeString,
    prettyPrintURL,
    webUrl,
} from "@/format";
import { openEvent } from "@/nav";
import { useTheme } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";
import { divisions } from "./divisions";

export type AnyEvent = FullEvent | LeanEvent;

function open(url: string | null) {
    if (url) WebBrowser.openBrowserAsync(url).catch(() => {});
}

export function EventInfo({
    event,
    live,
    delayMs,
}: {
    event: AnyEvent;
    live: boolean;
    delayMs: number | null;
}) {
    let c = useTheme();
    let streams = (event.livestreamsByDay ?? []).filter((d) => webUrl(d.liveStreamURL));
    // The website shows the calendar year, which isn't the season's for events after New Year.
    let year = dateFromStr(event.start).getFullYear();
    let place = locationString(event.location);
    return (
        <Card>
            <Title>
                {year} {event.name}
            </Title>
            {event.ongoing ? (
                <InfoRow icon="tower-broadcast">
                    <Txt>
                        <Txt weight="bold" color={c.redText}>
                            {live ? "Live" : "Ongoing"}
                        </Txt>
                        {live ? " · scores and rankings update by themselves" : ""}
                    </Txt>
                </InfoRow>
            ) : null}
            {delayMs != null ? (
                <InfoRow icon="clock">
                    <Txt color={delayColor(c, delayMs)}>{formatDelay(delayMs)}</Txt>
                </InfoRow>
            ) : null}
            <InfoRow icon="calendar-days">
                <Txt>{prettyPrintDateRangeString(event.start, event.end)}</Txt>
            </InfoRow>
            {webUrl(event.website) ? (
                <InfoRow
                    icon="link"
                    onPress={() => open(webUrl(event.website))}
                    label="Event website"
                >
                    <Txt color={c.link} numberOfLines={1}>
                        {prettyPrintURL(event.website!)}
                    </Txt>
                </InfoRow>
            ) : null}
            {streams.length ? (
                streams.map((s) => (
                    <InfoRow
                        key={s.day}
                        icon="video"
                        onPress={() => open(webUrl(s.liveStreamURL))}
                        label={`Livestream, ${prettyPrintDateRangeString(s.day, s.day, true)}`}
                    >
                        <Txt numberOfLines={1}>
                            {streams.length > 1 ? (
                                <Txt dim>{`${prettyPrintDateRangeString(
                                    s.day,
                                    s.day,
                                    true
                                )}  `}</Txt>
                            ) : null}
                            <Txt color={c.link}>{prettyPrintURL(s.liveStreamURL!)}</Txt>
                        </Txt>
                    </InfoRow>
                ))
            ) : webUrl(event.liveStreamURL) ? (
                <InfoRow
                    icon="video"
                    onPress={() => open(webUrl(event.liveStreamURL))}
                    label="Livestream"
                >
                    <Txt color={c.link} numberOfLines={1}>
                        {prettyPrintURL(event.liveStreamURL!)}
                    </Txt>
                </InfoRow>
            ) : null}
            {place ? (
                <InfoRow
                    icon="location-dot"
                    onPress={() => open(mapsUrl(place))}
                    label={`Map of ${place}`}
                >
                    <Txt color={c.link}>{place}</Txt>
                </InfoRow>
            ) : null}
            <DataFromFirst />
        </Card>
    );
}

export function Divisions({ event }: { event: AnyEvent }) {
    let c = useTheme();
    let list = divisions(event.name, event.relatedEvents ?? []);
    if (!list.length) return null;
    let many = list.length > 2;
    return (
        <View
            style={{
                flexDirection: "row",
                flexWrap: many ? "wrap" : "nowrap",
                gap: space.sm,
                marginHorizontal: CARD_MARGIN,
                marginTop: space.md,
            }}
        >
            {list.map((d) => (
                <Press
                    key={d.code}
                    onPress={() => openEvent(d.season, d.code, d.name)}
                    accessibilityRole="link"
                    accessibilityLabel={d.name}
                    style={{
                        flexGrow: 1,
                        flexBasis: many ? "40%" : 0,
                        minHeight: 44,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: space.sm,
                        paddingVertical: space.sm,
                        backgroundColor: c.surface,
                        borderWidth: 1,
                        borderColor: c.sep,
                        borderRadius: 8,
                    }}
                >
                    <Txt weight="bold" center style={{ textTransform: "capitalize" }}>
                        {d.label}
                    </Txt>
                </Press>
            ))}
        </View>
    );
}
