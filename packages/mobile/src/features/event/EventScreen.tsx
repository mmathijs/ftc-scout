import { FlashList } from "@shopify/flash-list";
import * as Haptics from "expo-haptics";
import { Stack } from "expo-router/stack";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useEvent } from "@/api/hooks";
import { PageHeaderRight } from "@/components/Header";
import { CardBottom, CardRow, CardTop } from "@/components/Card";
import { FolderTabs, type Tab } from "@/components/FolderTabs";
import { Press } from "@/components/Pressable";
import { GroupHeading, TeamRow } from "@/components/Rows";
import { Page, useRefresh } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { EmptyView, ErrorView, SavedNote } from "@/components/States";
import { Txt } from "@/components/Txt";
import { MatchLegend, MatchTableItem, TABLE_PAD } from "@/features/matches/MatchRow";
import { ScoreModal } from "@/features/matches/ScoreModal";
import { matchItems, type MatchData, type MatchItem } from "@/features/matches/model";
import { awardCategory, awardIsRanked, awardPlaceLabel } from "@/format";
import { openTeam } from "@/nav";
import { favorites, isFavoriteEvent, toggleFavoriteEvent } from "@/store/favorites";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space, TAP } from "@/theme/tokens";
import { awardGroups } from "./divisions";
import { Divisions, EventInfo, type AnyEvent } from "./EventHeader";
import { InsightsTab, RankingsTab } from "./EventTabs";
import { useLiveEvent } from "./useLiveEvent";

type TabId = "matches" | "rankings" | "insights" | "awards" | "teams";

type Award = AnyEvent["awards"][number];
type Item =
    | { kind: "top"; key: string }
    | { kind: "bottom"; key: string }
    | MatchItem
    | { kind: "legend"; key: string }
    | { kind: "table"; key: string; tab: "rankings" | "insights" }
    | {
          kind: "empty";
          key: string;
          icon: "calendar-xmark" | "medal" | "hashtag";
          title: string;
          text: string;
      }
    | { kind: "awardType"; key: string; title: string }
    | { kind: "award"; key: string; award: Award; n: number | null }
    | { kind: "team"; key: string; team: AnyEvent["teams"][number] };

function tabItems(event: AnyEvent, tab: TabId, matchRows: MatchItem[]): Item[] {
    let items: Item[] = [{ kind: "top", key: "top" }];
    if (tab == "matches") {
        if (matchRows.length) items.push(...matchRows, { kind: "legend", key: "legend" });
        else
            items.push({
                kind: "empty",
                key: "empty",
                icon: "calendar-xmark",
                title: event.started ? "No matches yet" : "Not started",
                text: event.started
                    ? "Matches show here once the event publishes them."
                    : "This event hasn't started. Its teams are under Teams.",
            });
    } else if (tab == "rankings" || tab == "insights") {
        items.push({ kind: "table", key: tab, tab });
    } else if (tab == "awards") {
        let groups = awardGroups(event.awards);
        for (let { type, divisionName } of groups) {
            items.push({
                kind: "awardType",
                key: `t-${type}-${divisionName ?? ""}`,
                title: `${divisionName ?? ""} ${awardCategory(type, event.season)}`.trim(),
            });
            let of = event.awards
                .filter((a) => a.type == type && (a.divisionName ?? null) == divisionName)
                .sort((a, b) => a.placement - b.placement);
            of.forEach((award, i) =>
                items.push({
                    kind: "award",
                    key: `${type}-${divisionName ?? ""}-${i}-${award.teamNumber}`,
                    award,
                    n: awardIsRanked(type) ? i + 1 : null,
                })
            );
        }
        if (!groups.length)
            items.push({
                kind: "empty",
                key: "empty",
                icon: "medal",
                title: "No awards yet",
                text: "Awards show here once the event announces them.",
            });
    } else if (tab == "teams") {
        let teams = [...event.teams].sort((a, b) => a.teamNumber - b.teamNumber);
        for (let team of teams) items.push({ kind: "team", key: `team-${team.teamNumber}`, team });
        if (!teams.length)
            items.push({
                kind: "empty",
                key: "empty",
                icon: "hashtag",
                title: "No teams yet",
                text: "Teams show here once they are registered.",
            });
    }
    items.push({ kind: "bottom", key: "bottom" });
    return items;
}

export function EventScreen({
    season,
    code,
    nameHint,
    deep = false,
}: {
    season: number;
    code: string;
    nameHint?: string;
    /** Pushed from another page rather than a tab root, so the bar offers a way home. */
    deep?: boolean;
}) {
    let c = useTheme();
    let { full, lean } = useEvent(season, code);
    let fullEvent = full.data?.eventByCode ?? null;
    let event = fullEvent ?? lean.data?.eventByCode ?? null;
    let loaded = full.data !== undefined || lean.data !== undefined;
    let refresh = useRefresh(full.refetch);
    let live = useLiveEvent(season, code, !!event?.ongoing);
    let favs = favorites.useValue();
    let favorite = isFavoriteEvent(favs, season, code);

    let [tab, setTab] = useState<TabId | null>(null);
    let [openId, setOpenId] = useState<number | null>(null);
    let onOpenMatch = useCallback((m: MatchData) => setOpenId(m.id), []);

    let hasMatches = !!event?.matches.length;
    // Finals divisions have matches but no rankings: their teams have no stats there.
    let unranked = !!event && !event.teams.some((t) => t.stats);
    let tabs: Tab<TabId>[] = [
        { id: "matches", label: "Matches", icon: "bolt" },
        ...(hasMatches && !unranked
            ? ([{ id: "rankings", label: "Rankings", icon: "trophy" }] as Tab<TabId>[])
            : []),
        ...(hasMatches
            ? ([{ id: "insights", label: "Insights", icon: "lightbulb" }] as Tab<TabId>[])
            : []),
        ...(event?.awards.length
            ? ([{ id: "awards", label: "Awards", icon: "medal" }] as Tab<TabId>[])
            : []),
        { id: "teams", label: event ? `Teams (${event.teams.length})` : "Teams", icon: "hashtag" },
    ];
    let current: TabId =
        tab && tabs.some((t) => t.id == tab) ? tab : hasMatches || !event ? "matches" : "teams";
    let flatLeft = tabs[0].id == current;

    // The delay is shown on every tab, so the info card doesn't change size with the tab.
    let matches = useMemo(() => matchItems(event?.matches ?? []), [event?.matches]);
    let items = useMemo(
        () => (event ? tabItems(event, current, matches.items) : []),
        [event, current, matches]
    );

    let openMatch = openId != null ? event?.matches.find((m) => m.id == openId) ?? null : null;

    let header = (
        <Stack.Screen
            options={{
                // Same title and star as the link set, so the header doesn't jump.
                title: event?.name ?? nameHint ?? "Event",
                headerRight: () => (
                    <PageHeaderRight
                        deep={deep}
                        active={favorite}
                        label={favorite ? "Remove from favorites" : "Add to favorites"}
                        onPress={
                            event
                                ? () => {
                                      Haptics.selectionAsync().catch(() => {});
                                      toggleFavoriteEvent({
                                          season,
                                          code,
                                          name: event!.name,
                                          start: event!.start,
                                          end: event!.end,
                                      });
                                  }
                                : undefined
                        }
                    />
                ),
            }}
        />
    );

    if (!loaded) {
        return (
            <Page>
                {header}
                {full.isError && lean.isError ? (
                    <ErrorView
                        error={full.error}
                        onRetry={() => (full.refetch(), lean.refetch())}
                        what="this event"
                    />
                ) : (
                    <>
                        <Skeleton rows={3} />
                        <Skeleton rows={10} title={false} />
                    </>
                )}
            </Page>
        );
    }
    if (!event) {
        return (
            <Page>
                {header}
                <EmptyView
                    icon="calendar-xmark"
                    title="Event not found"
                    text={`There is no ${season} event with the code ${code}.`}
                />
            </Page>
        );
    }

    // One list for all tabs, so the info card and tabs don't move when the tab changes.
    return (
        <Page>
            {header}
            <SavedNote
                updatedAt={full.dataUpdatedAt || lean.dataUpdatedAt}
                failed={full.isError && !!full.data}
            />
            <FlashList
                data={items}
                keyExtractor={(i) => i.key}
                getItemType={(i) => i.kind}
                refreshing={refresh.refreshing}
                onRefresh={refresh.onRefresh}
                ListHeaderComponent={
                    <>
                        <EventInfo event={event} live={live} delayMs={matches.delayMs} />
                        <Divisions event={event} />
                        <FolderTabs tabs={tabs} value={current} onChange={setTab} />
                    </>
                }
                ListFooterComponent={<View style={{ height: space.xl }} />}
                renderItem={({ item }) => {
                    switch (item.kind) {
                        case "top":
                            return <CardTop flatLeft={flatLeft} gap={false} />;
                        case "bottom":
                            return <CardBottom />;
                        case "mhead":
                        case "section":
                        case "match":
                            return (
                                <MatchTableItem
                                    item={item}
                                    timeZone={event!.timezone}
                                    onPress={onOpenMatch}
                                />
                            );
                        case "legend":
                            return (
                                <CardRow pad={TABLE_PAD}>
                                    <MatchLegend matches={event!.matches} />
                                </CardRow>
                            );
                        case "table":
                            return (
                                <CardRow pad={TABLE_PAD}>
                                    {!fullEvent && full.isError ? (
                                        <ErrorView
                                            error={full.error}
                                            onRetry={() => full.refetch()}
                                            what="the rest of this event"
                                        />
                                    ) : !fullEvent ? (
                                        <View
                                            style={{
                                                height: 240,
                                                alignItems: "center",
                                                justifyContent: "center",
                                            }}
                                        >
                                            <ActivityIndicator
                                                color={c.accent}
                                                accessibilityLabel="Loading"
                                            />
                                        </View>
                                    ) : item.tab == "rankings" ? (
                                        <RankingsTab event={fullEvent} />
                                    ) : (
                                        <InsightsTab event={fullEvent} onOpenMatch={onOpenMatch} />
                                    )}
                                </CardRow>
                            );
                        case "empty":
                            return (
                                <CardRow>
                                    <EmptyView
                                        icon={item.icon}
                                        title={item.title}
                                        text={item.text}
                                    />
                                </CardRow>
                            );
                        case "awardType":
                            return (
                                <CardRow>
                                    <View style={{ paddingTop: space.xs, paddingBottom: space.xs }}>
                                        <GroupHeading title={item.title} />
                                    </View>
                                </CardRow>
                            );
                        case "award": {
                            let a = item.award;
                            let place = awardPlaceLabel(a.type, a.placement);
                            return (
                                <CardRow>
                                    <Press
                                        onPress={() => openTeam(a.teamNumber, a.team.name, season)}
                                        accessibilityRole="link"
                                        style={{
                                            minHeight: TAP - 4,
                                            flexDirection: "row",
                                            alignItems: "center",
                                            paddingHorizontal: space.sm,
                                            borderRadius: radius.sm,
                                        }}
                                    >
                                        <Txt style={{ width: 26 }} tabular>
                                            {item.n ? `${item.n}.` : "•"}
                                        </Txt>
                                        <Txt style={{ flex: 1 }} numberOfLines={2}>
                                            {a.teamNumber} - <Txt italic>{a.team.name}</Txt>
                                            {a.personName ? ` (${a.personName})` : ""}
                                        </Txt>
                                        {place == "Captain" || place.endsWith("pick") ? (
                                            <Txt size="sm" dim>
                                                {place}
                                            </Txt>
                                        ) : null}
                                    </Press>
                                </CardRow>
                            );
                        }
                        case "team":
                            return (
                                <CardRow>
                                    <TeamRow
                                        season={season}
                                        number={item.team.team.number}
                                        name={item.team.team.name}
                                        location={item.team.team.location}
                                    />
                                </CardRow>
                            );
                    }
                }}
            />
            <ScoreModal
                match={openMatch}
                scoresReady={!!fullEvent}
                scoresFailed={
                    !fullEvent && full.isError ? (
                        <ErrorView
                            error={full.error}
                            onRetry={() => full.refetch()}
                            what="the breakdown"
                        />
                    ) : null
                }
                onClose={() => setOpenId(null)}
            />
        </Page>
    );
}
