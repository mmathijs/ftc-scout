import { CURRENT_SEASON } from "@ftc-scout/common";
import { FlashList } from "@shopify/flash-list";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import { useSearchData } from "@/api/hooks";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Press } from "@/components/Pressable";
import { Card, CardBottom, CardHeading, CardRow, CardTop } from "@/components/Card";
import { Page } from "@/components/Screen";
import { SearchField, type TextInputRef } from "@/components/SearchField";
import { Skeleton } from "@/components/Skeleton";
import { EmptyView, ErrorView, SavedNote } from "@/components/States";
import { Txt } from "@/components/Txt";
import { isCompetition, locationString, prettyPrintDateRangeString } from "@/format";
import { openEvent, openTeam } from "@/nav";
import { addRecentSearch, clearRecentSearches, settings } from "@/store/settings";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";
import { highlightParts, search, type SearchResult } from "./search";

function Highlighted({
    text,
    highlights,
    italic,
}: {
    text: string;
    highlights: number[];
    italic?: boolean;
}) {
    let c = useTheme();
    return (
        <Txt italic={italic} numberOfLines={1}>
            {highlightParts(text, highlights).map((p, i) =>
                p.hit ? (
                    <Txt
                        key={i}
                        weight="bold"
                        color={c.accent}
                        style={{ textDecorationLine: "underline" }}
                    >
                        {p.text}
                    </Txt>
                ) : (
                    p.text
                )
            )}
        </Txt>
    );
}

function Result({ result, onOpen }: { result: SearchResult; onOpen: () => void }) {
    let c = useTheme();
    let d = result.document;
    let isTeam = d.__typename == "Team";
    let detail =
        d.__typename == "Team"
            ? locationString(d.location)
            : prettyPrintDateRangeString(d.start, d.end);
    let name = d.__typename == "Team" ? `Team ${d.number} ${d.name}` : `Event ${d.name}`;
    return (
        <Press
            onPress={() => {
                onOpen();
                if (d.__typename == "Team") openTeam(d.number, d.name);
                else openEvent(d.season, d.code, d.name);
            }}
            accessibilityRole="link"
            accessibilityLabel={detail ? `${name}, ${detail}` : name}
            style={{
                minHeight: 60,
                flexDirection: "row",
                alignItems: "center",
                gap: space.md,
                paddingHorizontal: space.md,
                backgroundColor: c.surface,
                borderBottomWidth: 1,
                borderBottomColor: c.sep,
            }}
        >
            <View style={{ width: 36, alignItems: "center" }}>
                {d.__typename == "Team" ? (
                    <Icon name="hashtag" size={18} />
                ) : (
                    <Icon name="calendar-days" size={18} />
                )}
            </View>
            <View style={{ flex: 1 }}>
                {d.__typename == "Team" ? (
                    <Txt numberOfLines={1}>
                        <Txt weight="bold" tabular>
                            {d.number}
                        </Txt>
                        {"  "}
                        <Highlighted text={d.name} highlights={result.highlights} italic />
                    </Txt>
                ) : (
                    <Highlighted text={d.name} highlights={result.highlights} />
                )}
                <Txt size="sm" italic={!isTeam} dim numberOfLines={1}>
                    {detail}
                </Txt>
            </View>
        </Press>
    );
}

// The search list is cached on the device, so results come as you type and work offline.
export function SearchScreen() {
    let c = useTheme();
    let [text, setText] = useState("");
    let deferred = useDeferredValue(text);
    let query = useSearchData(CURRENT_SEASON);
    let recent = settings.useValue().recentSearches;
    let input = useRef<TextInputRef>(null);

    useEffect(() => {
        let t = setTimeout(() => input.current?.focus(), 250);
        return () => clearTimeout(t);
    }, []);

    let lists = useMemo(() => {
        let d = query.data;
        return {
            events: d ? d.eventsSearch.filter((e) => isCompetition(e.type)) : [],
            teams: d ? d.teamsSearch : [],
        };
    }, [query.data]);
    let results = useMemo(() => search(deferred, lists.events, lists.teams), [deferred, lists]);

    let typed = deferred.trim() != "";

    return (
        <Page>
            <View style={{ padding: space.sm, backgroundColor: c.theme }}>
                <SearchField
                    ref={input}
                    plain
                    value={text}
                    onChangeText={setText}
                    placeholder="Search for teams and events"
                    accessibilityLabel="Search teams and events"
                    onSubmitEditing={() => {
                        // The list can still be showing the results for what was typed before.
                        let top =
                            deferred == text ? results : search(text, lists.events, lists.teams);
                        let first = top[0]?.document;
                        if (!first) return;
                        addRecentSearch(text);
                        if (first.__typename == "Team") openTeam(first.number, first.name);
                        else openEvent(first.season, first.code, first.name);
                    }}
                />
            </View>
            <SavedNote updatedAt={query.dataUpdatedAt} failed={query.isError} />
            {query.data === undefined ? (
                query.isError ? (
                    <ErrorView
                        error={query.error}
                        onRetry={() => query.refetch()}
                        what="the search"
                    />
                ) : (
                    <Skeleton rows={8} title={false} />
                )
            ) : !typed ? (
                recent.length ? (
                    <Card>
                        <CardHeading title="Recent" />
                        {recent.map((r) => (
                            <Press
                                key={r}
                                onPress={() => setText(r)}
                                accessibilityRole="button"
                                accessibilityLabel={`Search ${r}`}
                                style={{
                                    minHeight: 44,
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: space.md,
                                    paddingHorizontal: space.sm,
                                    borderRadius: radius.sm,
                                }}
                            >
                                <Icon name="clock-rotate-left" size={15} color={c.textSecondary} />
                                <Txt style={{ flex: 1 }}>{r}</Txt>
                            </Press>
                        ))}
                        <View style={{ paddingTop: space.sm, alignItems: "flex-start" }}>
                            <Button label="Clear recent searches" onPress={clearRecentSearches} />
                        </View>
                    </Card>
                ) : (
                    <Card>
                        <EmptyView
                            icon="magnifying-glass"
                            title="Search for teams and events"
                            text="Type a team number, a team's name or an event's name."
                        />
                    </Card>
                )
            ) : results.length == 0 ? (
                <Card>
                    <EmptyView
                        icon="magnifying-glass"
                        title="No results"
                        text={`Nothing matches “${deferred.trim()}”.`}
                    />
                </Card>
            ) : (
                <FlashList
                    data={results}
                    keyExtractor={(r) =>
                        r.document.__typename == "Team"
                            ? `t${r.document.number}`
                            : `e${r.document.season}${r.document.code}`
                    }
                    keyboardShouldPersistTaps="handled"
                    onScrollBeginDrag={Keyboard.dismiss}
                    ListHeaderComponent={<CardTop />}
                    ListFooterComponent={<CardBottom />}
                    renderItem={({ item }) => (
                        <CardRow pad={space.xs}>
                            <Result result={item} onOpen={() => addRecentSearch(text)} />
                        </CardRow>
                    )}
                />
            )}
        </Page>
    );
}
