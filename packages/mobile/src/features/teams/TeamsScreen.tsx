import { CURRENT_SEASON, fuzzySearch } from "@ftc-scout/common";
import { FlashList } from "@shopify/flash-list";
import { useDeferredValue, useMemo, useState } from "react";
import { Keyboard, View } from "react-native";
import { useSearchData, type SearchTeam } from "@/api/hooks";
import { Card, CardBottom, CardRow, CardTop, Title } from "@/components/Card";
import { TeamRow } from "@/components/Rows";
import { Page, useRefresh } from "@/components/Screen";
import { SearchField } from "@/components/SearchField";
import { Skeleton } from "@/components/Skeleton";
import { EmptyView, ErrorView, SavedNote } from "@/components/States";
import { Txt } from "@/components/Txt";
import { space } from "@/theme/tokens";

const NUMBER = new Intl.NumberFormat();

type Item =
    | { kind: "filters"; key: string }
    /** Loading or failed, before there are any teams. */
    | { kind: "status"; key: string }
    | { kind: "top"; key: string }
    | { kind: "bottom"; key: string }
    | { kind: "none"; key: string }
    | { kind: "team"; key: string; team: SearchTeam };

export function filterTeams(teams: SearchTeam[], needle: string): SearchTeam[] {
    needle = needle.trim();
    if (!needle) return teams;
    if (/^\d+$/.test(needle)) return teams.filter((t) => (t.number + "").startsWith(needle));
    let lower = needle.toLowerCase();
    let exact = teams.filter(
        (t) =>
            t.name.toLowerCase().includes(lower) ||
            t.location.city.toLowerCase().includes(lower) ||
            t.location.state.toLowerCase() == lower ||
            t.location.country.toLowerCase() == lower
    );
    if (exact.length) return exact;
    return fuzzySearch(teams, needle, Infinity, "name", true).map((r) => r.document);
}

export function TeamsScreen() {
    let query = useSearchData(CURRENT_SEASON);
    let refresh = useRefresh(query.refetch);
    let [text, setText] = useState("");
    let deferred = useDeferredValue(text);

    let sorted = useMemo(
        () => [...(query.data?.teamsSearch ?? [])].sort((a, b) => a.number - b.number),
        [query.data]
    );
    let teams = useMemo(() => filterTeams(sorted, deferred), [sorted, deferred]);
    let loaded = query.data !== undefined;
    // The search box stays in the list throughout, so it keeps the keyboard when the teams arrive.
    let items = useMemo<Item[]>(
        () => [
            { kind: "filters", key: "filters" },
            ...(!loaded
                ? [{ kind: "status", key: "status" } as Item]
                : [
                      { kind: "top", key: "top" } as Item,
                      ...(teams.length
                          ? teams.map(
                                (team) => ({ kind: "team", key: String(team.number), team } as Item)
                            )
                          : [{ kind: "none", key: "none" } as Item]),
                      { kind: "bottom", key: "bottom" } as Item,
                  ]),
        ],
        [teams, loaded]
    );

    let filters = (
        <Card>
            <Title>Teams</Title>
            <Txt style={{ marginBottom: space.xs }}>Search</Txt>
            <SearchField
                value={text}
                onChangeText={setText}
                placeholder="Search"
                accessibilityLabel="Search teams by number, name or place"
            />
            {query.data ? (
                <Txt size="sm" dim style={{ marginTop: space.xs }}>
                    {NUMBER.format(teams.length)} {teams.length == 1 ? "team" : "teams"}
                </Txt>
            ) : null}
        </Card>
    );

    return (
        <Page>
            <SavedNote updatedAt={query.dataUpdatedAt} failed={query.isError} />
            <FlashList
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
                                    what="the teams"
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
                                        icon="hashtag"
                                        title="No teams"
                                        text="No team matches that."
                                    />
                                </CardRow>
                            );
                        case "team":
                            return (
                                <CardRow pad={space.xs}>
                                    <TeamRow
                                        number={item.team.number}
                                        name={item.team.name}
                                        location={item.team.location}
                                    />
                                </CardRow>
                            );
                    }
                }}
            />
        </Page>
    );
}
