import {
    DESCRIPTORS,
    EventTypeOption,
    fuzzySearch,
    RegionOption,
    type Season,
} from "@ftc-scout/common";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import { useEvents, type SearchEvent } from "@/api/hooks";
import { Button } from "@/components/Button";
import { Card, CardBottom, CardRow, CardTop, Title } from "@/components/Card";
import { EventRow, GroupHeading } from "@/components/Rows";
import { Page, useRefresh } from "@/components/Screen";
import { SearchField } from "@/components/SearchField";
import { Select } from "@/components/Select";
import { Skeleton } from "@/components/Skeleton";
import { EmptyView, ErrorView, SavedNote } from "@/components/States";
import { Txt } from "@/components/Txt";
import { ALL_EVENT_TYPE_OPTIONS, REGION_OPTIONS, SEASON_OPTIONS } from "@/features/options";
import { eventTyMatches, localDay, prettyPrintDateRange, regionMatches } from "@/format";
import { setSeason, settings } from "@/store/settings";
import { space } from "@/theme/tokens";
import { BEFORE_KICKOFF, groupByWeek, type WeekItem } from "./weeks";

type Item =
    | { kind: "filters"; key: string }
    /** Loading or failed, before there are any events. */
    | { kind: "status"; key: string }
    | { kind: "top"; key: string }
    | { kind: "bottom"; key: string }
    | { kind: "none"; key: string }
    | WeekItem<SearchEvent>;

export function EventsScreen() {
    let season = settings.useValue().season;
    let query = useEvents(season);
    let refresh = useRefresh(query.refetch);
    let [region, setRegion] = useState<RegionOption>(RegionOption.All);
    let [type, setType] = useState<EventTypeOption>(EventTypeOption.Competition);
    let [text, setText] = useState("");
    let deferred = useDeferredValue(text);
    let list = useRef<FlashListRef<Item>>(null);

    let weeks = useMemo(() => {
        let events = (query.data?.eventsSearch ?? [])
            .filter(
                (e) =>
                    regionMatches(region, e.regionCode ?? "") && eventTyMatches(type, e.type as any)
            )
            .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
        if (deferred.trim()) {
            let kept = new Set(
                fuzzySearch(events, deferred.trim(), Infinity, "name").map((r) => r.document)
            );
            events = events.filter((e) => kept.has(e));
        }
        return groupByWeek(events, season as Season);
    }, [query.data, region, type, deferred, season]);

    let loaded = query.data !== undefined;
    // The filters stay in the list throughout, so the search box keeps the keyboard when the
    // events arrive (and the season picker isn't redrawn when a season loads).
    let items = useMemo<Item[]>(
        () => [
            { kind: "filters", key: "filters" },
            ...(!loaded
                ? [{ kind: "status", key: "status" } as Item]
                : [
                      { kind: "top", key: "top" } as Item,
                      ...(weeks.length ? weeks : [{ kind: "none", key: "none" } as Item]),
                      { kind: "bottom", key: "bottom" } as Item,
                  ]),
        ],
        [weeks, loaded]
    );

    let nowIndex = useMemo(() => {
        let t = localDay();
        let i = items.findIndex((it) => it.kind == "event" && it.event.end >= t);
        if (i <= 0) return 0;
        while (i > 0 && items[i].kind != "week") i--;
        return i;
    }, [items]);

    // Don't auto-scroll to this week: jumping down a page on arrival was disorienting.
    let filtering = deferred.trim() != "";
    useEffect(() => {
        if (filtering) list.current?.scrollToOffset({ offset: 0, animated: false });
    }, [filtering]);

    let filters = (
        <Card>
            <Title>{DESCRIPTORS[season as Season].seasonName} Events</Title>
            <View style={{ gap: space.sm }}>
                <Select
                    title="Season"
                    value={season}
                    groups={SEASON_OPTIONS}
                    onChange={setSeason}
                />
                <View style={{ flexDirection: "row", gap: space.sm }}>
                    <Select
                        title="Regions"
                        value={region}
                        groups={REGION_OPTIONS}
                        onChange={setRegion}
                        style={{ flex: 1 }}
                    />
                    <Select
                        title="Event Types"
                        value={type}
                        groups={ALL_EVENT_TYPE_OPTIONS}
                        onChange={setType}
                        style={{ flex: 1 }}
                    />
                </View>
                <View>
                    <Txt style={{ marginBottom: space.xs }}>Search</Txt>
                    <SearchField
                        value={text}
                        onChangeText={setText}
                        placeholder="Search"
                        accessibilityLabel="Search events by name"
                    />
                </View>
                {nowIndex >= 3 && !filtering ? (
                    <View style={{ flexDirection: "row" }}>
                        <Button
                            label="Jump to this week"
                            icon="calendar-day"
                            onPress={() =>
                                list.current?.scrollToIndex({ index: nowIndex, animated: true })
                            }
                        />
                    </View>
                ) : null}
            </View>
        </Card>
    );

    return (
        <Page>
            <SavedNote
                updatedAt={query.dataUpdatedAt}
                failed={query.isError}
                fetching={query.isFetching}
            />
            <FlashList
                ref={list}
                data={items}
                keyExtractor={(i) => i.key}
                getItemType={(i) => i.kind}
                keyboardShouldPersistTaps="handled"
                onScrollBeginDrag={Keyboard.dismiss}
                refreshing={refresh.refreshing}
                onRefresh={refresh.onRefresh}
                ListFooterComponent={<View style={{ height: space.xl }} />}
                renderItem={({ item }) => {
                    switch (item.kind) {
                        case "filters":
                            return filters;
                        case "status":
                            return query.isError ? (
                                <ErrorView
                                    error={query.error}
                                    onRetry={() => query.refetch()}
                                    what="the events"
                                />
                            ) : (
                                <Skeleton rows={12} title={false} />
                            );
                        case "top":
                            return <CardTop />;
                        case "bottom":
                            return <CardBottom />;
                        case "none":
                            return (
                                <CardRow>
                                    <EmptyView
                                        icon="calendar-xmark"
                                        title="No events"
                                        text="No event matches these filters."
                                    />
                                </CardRow>
                            );
                        case "week":
                            return (
                                <CardRow>
                                    <View style={{ paddingVertical: space.xs }}>
                                        <GroupHeading
                                            title={
                                                item.week == BEFORE_KICKOFF
                                                    ? "Before kickoff"
                                                    : `Week ${item.week + 1}`
                                            }
                                            detail={prettyPrintDateRange(item.start, item.end)}
                                        />
                                    </View>
                                </CardRow>
                            );
                        case "event":
                            return (
                                <CardRow>
                                    <EventRow event={item.event} />
                                </CardRow>
                            );
                    }
                }}
            />
        </Page>
    );
}
