import { CURRENT_SEASON, DESCRIPTORS, type Season } from "@ftc-scout/common";
import { FlashList } from "@shopify/flash-list";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Stack } from "expo-router/stack";
import * as WebBrowser from "expo-web-browser";
import { useMemo, useState } from "react";
import { View } from "react-native";
import type * as T from "@/api/generated/types";
import { useTeam } from "@/api/hooks";
import { PageHeaderRight } from "@/components/Header";
import { Card, CardBottom, CardHeading, CardRow, CardTop } from "@/components/Card";
import { Press } from "@/components/Pressable";
import { DataFromFirst, InfoRow } from "@/components/Rows";
import { Page, useRefresh } from "@/components/Screen";
import { Select } from "@/components/Select";
import { Skeleton } from "@/components/Skeleton";
import { ErrorView, NoTeam, SavedNote } from "@/components/States";
import { Txt } from "@/components/Txt";
import { MatchTableItem } from "@/features/matches/MatchRow";
import { ScoreModal } from "@/features/matches/ScoreModal";
import { matchItems, type MatchData, type MatchItem } from "@/features/matches/model";
import { seasonOptions } from "@/features/options";
import {
    awardPlacementParts,
    locationString,
    mapsUrl,
    prettyPrintDateRangeString,
    prettyPrintFloat,
    prettyPrintOrdinal,
    prettyPrintURL,
    sortAwardTypes,
    webUrl,
} from "@/format";
import { openEvent, teamTitle } from "@/nav";
import { favorites, isFavoriteTeam, toggleFavoriteTeam } from "@/store/favorites";
import { settings } from "@/store/settings";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

type Team = NonNullable<T.TeamQuery["teamByNumber"]>;
type TeamEvent = Team["events"][number];

type Item =
    | { kind: "head"; key: string }
    | { kind: "event"; key: string; ev: TeamEvent }
    | { kind: "table"; key: string; item: MatchItem; timeZone: string }
    | { kind: "eventEnd"; key: string }
    | { kind: "empty"; key: string }
    | { kind: "pending"; key: string };

function openUrl(url: string | null) {
    if (url) WebBrowser.openBrowserAsync(url).catch(() => {});
}

function QuickStats({ qs, season }: { qs: NonNullable<Team["quickStats"]>; season: Season }) {
    let c = useTheme();
    let columns = [
        // Seasons where penalties come off a team's own score have no non-penalty total.
        { name: DESCRIPTORS[season].pensSubtract ? "Total" : "Total NP", stat: qs.tot },
        { name: "Auto", stat: qs.auto },
        { name: "Teleop", stat: qs.dc },
        { name: "Endgame", stat: qs.eg },
    ];
    let percentile = (rank: number) =>
        prettyPrintFloat((1 - (rank - 1) / Math.max(qs.count - 1, 1)) * 100) + "%";
    let rows: [string, (s: { value: number; rank: number }) => string][] = [
        ["Best OPR", (s) => prettyPrintFloat(s.value)],
        ["World Rank", (s) => prettyPrintOrdinal(s.rank)],
        ["Percentile", (s) => percentile(s.rank)],
    ];
    let label = { width: 78, borderRightWidth: 1, borderRightColor: c.sep };
    return (
        <Card>
            <CardHeading title="Quick Stats" />
            {/* Each row is read out with the column names, so screen readers skip these. */}
            <View
                style={{ flexDirection: "row" }}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
            >
                <View style={label} />
                {columns.map((col) => (
                    <View
                        key={col.name}
                        style={{
                            flex: 1,
                            alignItems: "center",
                            paddingBottom: space.xs,
                            borderBottomWidth: 1,
                            borderBottomColor: c.sep,
                        }}
                    >
                        <Txt size="sm" weight="bold" numberOfLines={1}>
                            {col.name}
                        </Txt>
                    </View>
                ))}
            </View>
            {rows.map(([name, value]) => (
                <View
                    key={name}
                    accessible
                    accessibilityLabel={`${name}: ${columns
                        .map((col) => `${col.name} ${value(col.stat)}`)
                        .join(", ")}`}
                    style={{ flexDirection: "row", minHeight: 28, alignItems: "center" }}
                >
                    <View style={[label, { alignSelf: "stretch", justifyContent: "center" }]}>
                        <Txt size="sm" weight="bold" numberOfLines={1}>
                            {name}
                        </Txt>
                    </View>
                    {columns.map((col) => (
                        <View key={col.name} style={{ flex: 1, alignItems: "center" }}>
                            <Txt size="sm" tabular numberOfLines={1}>
                                {value(col.stat)}
                            </Txt>
                        </View>
                    ))}
                </View>
            ))}
        </Card>
    );
}

function Head({
    team,
    season,
    onSeason,
}: {
    team: Team;
    season: Season;
    onSeason: (s: Season) => void;
}) {
    let c = useTheme();
    let place = locationString(team.location);
    return (
        <View>
            <Card>
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: space.sm,
                        marginBottom: space.sm,
                    }}
                >
                    <Txt
                        size="xxl"
                        weight="bold"
                        accessibilityRole="header"
                        style={{ flex: 1, minWidth: 0 }}
                    >
                        {team.number} - {team.name}
                    </Txt>
                </View>
                {team.schoolName ? (
                    <InfoRow icon="school">
                        <Txt>{team.schoolName}</Txt>
                    </InfoRow>
                ) : null}
                {team.sponsors.length ? (
                    <InfoRow icon="heart">
                        <Txt>{team.sponsors.join(", ")}</Txt>
                    </InfoRow>
                ) : null}
                {webUrl(team.website) ? (
                    <InfoRow
                        icon="link"
                        onPress={() => openUrl(webUrl(team.website))}
                        label="Team website"
                    >
                        <Txt color={c.link} numberOfLines={1}>
                            {prettyPrintURL(team.website!)}
                        </Txt>
                    </InfoRow>
                ) : null}
                {place ? (
                    <InfoRow
                        icon="location-dot"
                        onPress={() => openUrl(mapsUrl(place))}
                        label={`Map of ${place}`}
                    >
                        <Txt color={c.link}>{place}</Txt>
                    </InfoRow>
                ) : null}
                <InfoRow icon="cake-candles">
                    <Txt>Rookie Year: {team.rookieYear}</Txt>
                </InfoRow>
                <DataFromFirst />
            </Card>

            <Select
                title="Season"
                showLabel={false}
                plain
                value={season}
                // Always offer the season being shown, even one the team sat out.
                groups={seasonOptions([
                    ...team.activeSeasons.filter((s): s is number => s != null),
                    season,
                ])}
                onChange={onSeason}
                style={{ marginHorizontal: space.sm, marginTop: space.md }}
            />

            {team.quickStats ? <QuickStats qs={team.quickStats} season={season} /> : null}
        </View>
    );
}

type Stats = NonNullable<TeamEvent["stats"]>;

// As on the website: without penalty points (npOPR) in seasons that give them to the opponent.
function EventStats({ s }: { s: Stats }) {
    let np = "totalPointsNp" in s.opr ? "np" : "";
    let total = (x: Stats["opr"]) => ("totalPointsNp" in x ? x.totalPointsNp : x.totalPoints);
    return (
        <>
            <InfoRow icon="trophy">
                <Txt>
                    <Txt weight="bold">{prettyPrintOrdinal(s.rank)}</Txt> place (quals)
                </Txt>
            </InfoRow>
            <View style={{ paddingLeft: 28, gap: 3 }}>
                {"wins" in s ? (
                    <Txt>
                        W-L-T:{" "}
                        <Txt weight="bold" tabular>
                            {s.wins}-{s.losses}-{s.ties}
                        </Txt>
                    </Txt>
                ) : null}
                <Txt>
                    <Txt weight="bold">{prettyPrintFloat(s.rp)}</Txt> RP ·{" "}
                    <Txt weight="bold">{prettyPrintFloat(total(s.opr))}</Txt> {np}OPR ·{" "}
                    <Txt weight="bold">{prettyPrintFloat(total(s.avg))}</Txt> {np}AVG
                </Txt>
            </View>
        </>
    );
}

function EventHead({ ev }: { ev: TeamEvent }) {
    let c = useTheme();
    let event = ev.event;
    // A season the app doesn't know yet has no stats it can read.
    let stats = ev.stats && "rank" in ev.stats ? ev.stats : null;
    let awards = [...ev.awards].sort(
        (a, b) => sortAwardTypes(a.type, b.type) || a.placement - b.placement
    );
    let place = locationString(event.location);
    return (
        <View style={{ paddingBottom: space.sm }}>
            <Press
                onPress={() => openEvent(event.season, event.code, event.name)}
                accessibilityRole="link"
                accessibilityLabel={event.name}
                style={{ minHeight: 36, justifyContent: "center" }}
            >
                <Txt size="xl" weight="semibold" accessibilityRole="header">
                    {event.name}
                </Txt>
            </Press>
            <InfoRow icon="calendar-days">
                <Txt>{prettyPrintDateRangeString(event.start, event.end)}</Txt>
            </InfoRow>
            {place ? (
                <InfoRow
                    icon="location-dot"
                    onPress={() => openUrl(mapsUrl(place))}
                    label={`Map of ${place}`}
                >
                    <Txt color={c.link}>{place}</Txt>
                </InfoRow>
            ) : null}
            {stats ? <EventStats s={stats} /> : null}
            {awards.map((a, i) => {
                let [name, placement] = awardPlacementParts(
                    a.type,
                    a.placement,
                    a.personName,
                    event.season
                );
                return (
                    <InfoRow key={i} icon="medal">
                        <Txt>
                            <Txt weight="bold">{name}</Txt> {placement}
                        </Txt>
                    </InfoRow>
                );
            })}
        </View>
    );
}

function NoEvents({ name, season }: { name: string; season: Season }) {
    return (
        <Card style={{ marginBottom: space.xl }}>
            <Txt weight="bold" center>
                {name} {season == CURRENT_SEASON ? "has not yet played in" : "did not compete in"}{" "}
                any {DESCRIPTORS[season].seasonName} events.
            </Txt>
            <Txt center style={{ marginTop: space.xs }}>
                Try choosing a different season from the dropdown menu.
            </Txt>
        </Card>
    );
}

export function TeamScreen({
    number,
    nameHint,
    seasonHint,
    deep = false,
}: {
    number: number;
    nameHint?: string;
    /**
     * The season in the page's link. Choosing another one changes the link, so going back to an
     * open team page can tell which season it shows.
     */
    seasonHint?: Season | null;
    /** Pushed from another page rather than a tab root, so the bar offers a way home. */
    deep?: boolean;
}) {
    let preferred = settings.useValue().season;
    let chosen = seasonHint ?? null;
    let setChosen = (s: Season) => router.setParams({ season: String(s) });
    let first = useTeam(number, chosen ?? preferred);

    // A team with no events in the preferred season opens on its last earlier one.
    let firstTeam = first.data?.teamByNumber;
    let earlier = (firstTeam?.activeSeasons ?? []).filter(
        (s): s is number => s != null && s < preferred
    );
    let fallback =
        chosen == null && firstTeam && !firstTeam.events.length && earlier.length
            ? (Math.max(...earlier) as Season)
            : null;
    let season = chosen ?? fallback ?? preferred;
    let second = useTeam(number, season);
    let query = fallback ? second : first;

    let refresh = useRefresh(query.refetch);
    let favs = favorites.useValue();
    let favorite = isFavoriteTeam(favs, number);
    let [open, setOpen] = useState<MatchData | null>(null);
    // Show the team from the first query while the fallback season loads.
    let pending = !!fallback && second.data === undefined;
    let team = (pending ? firstTeam : query.data?.teamByNumber) ?? null;

    let items = useMemo(() => {
        if (!team) return [];
        let out: Item[] = [{ kind: "head", key: "head" }];
        let events = [...team.events].sort(
            (a, b) => new Date(b.event.start).getTime() - new Date(a.event.start).getTime()
        );
        for (let ev of events) {
            out.push({ kind: "event", key: `e-${ev.eventCode}`, ev });
            let rows = matchItems(
                ev.matches.map((m) => m.match as MatchData),
                `${ev.eventCode}-`
            ).items;
            for (let item of rows)
                out.push({ kind: "table", key: item.key, item, timeZone: ev.event.timezone });
            out.push({ kind: "eventEnd", key: `end-${ev.eventCode}` });
        }
        if (pending) out.push({ kind: "pending", key: "pending" });
        else if (!events.length) out.push({ kind: "empty", key: "empty" });
        return out;
    }, [team, pending]);

    let header = (
        <Stack.Screen
            options={{
                // Same title and star as the link set, so the header doesn't jump.
                title: teamTitle(number, team?.name ?? nameHint),
                headerRight: () => (
                    <PageHeaderRight
                        deep={deep}
                        active={favorite}
                        label={favorite ? "Remove from favorites" : "Add to favorites"}
                        onPress={
                            team
                                ? () => {
                                      Haptics.selectionAsync().catch(() => {});
                                      toggleFavoriteTeam({
                                          number: team!.number,
                                          name: team!.name,
                                      });
                                  }
                                : undefined
                        }
                    />
                ),
            }}
        />
    );

    if (query.data === undefined && !pending) {
        return (
            <Page>
                {header}
                {query.isError ? (
                    <ErrorView
                        error={query.error}
                        onRetry={() => query.refetch()}
                        what="this team"
                    />
                ) : (
                    <>
                        <Skeleton rows={4} />
                        <Skeleton rows={8} title={false} />
                    </>
                )}
            </Page>
        );
    }
    if (!team) {
        return (
            <Page>
                {header}
                <NoTeam number={number} />
            </Page>
        );
    }

    return (
        <Page>
            {header}
            <SavedNote updatedAt={query.dataUpdatedAt} failed={query.isError} />
            <FlashList
                data={items}
                keyExtractor={(i) => i.key}
                getItemType={(i) => (i.kind == "table" ? i.item.kind : i.kind)}
                refreshing={refresh.refreshing}
                onRefresh={refresh.onRefresh}
                renderItem={({ item }) => {
                    switch (item.kind) {
                        case "head":
                            return (
                                <Head team={team!} season={season as Season} onSeason={setChosen} />
                            );
                        case "event":
                            return (
                                <>
                                    <CardTop />
                                    <CardRow>
                                        <EventHead ev={item.ev} />
                                    </CardRow>
                                </>
                            );
                        case "table":
                            return (
                                <MatchTableItem
                                    item={item.item}
                                    timeZone={item.timeZone}
                                    focusedTeam={number}
                                    onPress={setOpen}
                                />
                            );
                        case "eventEnd":
                            return <CardBottom />;
                        case "pending":
                            return query.isError ? (
                                <ErrorView
                                    error={query.error}
                                    onRetry={() => query.refetch()}
                                    what="this team's season"
                                />
                            ) : (
                                <Skeleton rows={8} title={false} />
                            );
                        case "empty":
                            return <NoEvents name={team!.name} season={season} />;
                    }
                }}
            />
            <ScoreModal match={open} onClose={() => setOpen(null)} />
        </Page>
    );
}
