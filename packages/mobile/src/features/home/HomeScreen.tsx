import { CURRENT_SEASON } from "@ftc-scout/common";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useHome } from "@/api/hooks";
import { Card, CardHeading } from "@/components/Card";
import { Icon, type IconName } from "@/components/Icon";
import { Press } from "@/components/Pressable";
import { ScrollScreen } from "@/components/Screen";
import { Select } from "@/components/Select";
import { Txt } from "@/components/Txt";
import { MatchHead, MatchRow, MatchSection, TABLE_PAD } from "@/features/matches/MatchRow";
import { ScoreModal } from "@/features/matches/ScoreModal";
import { matchItems, type MatchData } from "@/features/matches/model";
import { locationString, prettyPrintDateRange } from "@/format";
import { openEvent, openTeam } from "@/nav";
import { favorites } from "@/store/favorites";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space, TAP } from "@/theme/tokens";

function InfoBox({
    icon,
    value,
    label,
    onPress,
}: {
    icon: IconName;
    value: number;
    label: string;
    onPress: () => void;
}) {
    let c = useTheme();
    return (
        <Press
            onPress={onPress}
            accessibilityRole="link"
            accessibilityLabel={`${value} ${label}`}
            style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: space.sm,
                backgroundColor: c.surface,
                borderColor: c.sep,
                borderWidth: 1,
                borderRadius: radius.md,
                padding: space.sm,
            }}
        >
            <View
                style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: c.theme,
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <Icon name={icon} size={18} color={c.onTheme} />
            </View>
            <View style={{ flex: 1 }}>
                <Txt weight="bold" tabular>
                    {value}
                </Txt>
                <Txt size="sm" dim>
                    {label}
                </Txt>
            </View>
        </Press>
    );
}

function ListLink({ title, sub, onPress }: { title: string; sub?: string; onPress: () => void }) {
    return (
        <Press
            onPress={onPress}
            accessibilityRole="link"
            accessibilityLabel={sub ? `${title}, ${sub}` : title}
            style={{
                minHeight: TAP,
                justifyContent: "center",
                paddingHorizontal: space.sm,
                paddingVertical: space.xs,
                borderRadius: radius.sm,
            }}
        >
            <Txt>{title}</Txt>
            {sub ? (
                <Txt size="sm" italic dim>
                    {sub}
                </Txt>
            ) : null}
        </Press>
    );
}

const FAVORITES_SHOWN = 5;

type RecordMode = "wo-penalties" | "w-penalties";

export function HomeScreen() {
    let c = useTheme();
    let season = CURRENT_SEASON;
    let query = useHome(season);
    let favs = favorites.useValue();
    let [mode, setMode] = useState<RecordMode>("wo-penalties");
    let [open, setOpen] = useState<MatchData | null>(null);

    return (
        <>
            <ScrollScreen query={query} what="the home page">
                {(data) => {
                    let record =
                        mode == "wo-penalties"
                            ? data.tradWorldRecord
                            : data.tradWorldRecordWithPenalties;
                    let rows = record ? matchItems([record as MatchData]).items : [];
                    let eventsToday = data.eventsOnDate;
                    return (
                        <>
                            <View
                                style={{
                                    alignItems: "center",
                                    paddingTop: space.xl,
                                    paddingHorizontal: space.lg,
                                }}
                            >
                                <Txt
                                    weight="regular"
                                    accessibilityRole="header"
                                    accessibilityLabel="FTC Scout"
                                    style={{ fontSize: 40 }}
                                >
                                    FTC
                                    <Txt italic style={{ fontSize: 40 }}>
                                        Scout
                                    </Txt>
                                </Txt>
                                <Txt size="lg" center style={{ marginTop: space.xs }}>
                                    A new way to track and scout{" "}
                                    <Txt size="lg" italic>
                                        FIRST
                                    </Txt>{" "}
                                    Tech Challenge
                                </Txt>
                            </View>

                            <View
                                style={{
                                    flexDirection: "row",
                                    gap: space.sm,
                                    paddingHorizontal: space.sm,
                                    paddingTop: space.xl,
                                }}
                            >
                                <InfoBox
                                    icon="hashtag"
                                    value={data.activeTeamsCount}
                                    label="Active Teams"
                                    onPress={() => router.navigate("/teams" as Href)}
                                />
                                <InfoBox
                                    icon="bolt"
                                    value={data.matchesPlayedCount}
                                    label="Matches Played"
                                    onPress={() => router.navigate("/events" as Href)}
                                />
                            </View>

                            {favs.teams.length || favs.events.length ? (
                                <Card>
                                    <CardHeading
                                        title="Favorites"
                                        right={<Icon name="star" size={14} color={c.late} />}
                                    />
                                    {favs.teams.slice(0, FAVORITES_SHOWN).map((t) => (
                                        <ListLink
                                            key={`t${t.number}`}
                                            title={`${t.number} - ${t.name}`}
                                            onPress={() => openTeam(t.number, t.name)}
                                        />
                                    ))}
                                    {favs.events
                                        .slice(0, Math.max(0, FAVORITES_SHOWN - favs.teams.length))
                                        .map((e) => (
                                            <ListLink
                                                key={`e${e.season}${e.code}`}
                                                title={`${e.season} ${e.name}`}
                                                onPress={() => openEvent(e.season, e.code, e.name)}
                                            />
                                        ))}
                                    {favs.teams.length + favs.events.length > FAVORITES_SHOWN ? (
                                        <ListLink
                                            title={`All ${
                                                favs.teams.length + favs.events.length
                                            } favorites`}
                                            onPress={() => router.navigate("/favorites" as Href)}
                                        />
                                    ) : null}
                                </Card>
                            ) : null}

                            <Card>
                                <CardHeading
                                    title="Today's Events"
                                    right={
                                        <Txt size="sm">
                                            {prettyPrintDateRange(new Date(), new Date())}
                                        </Txt>
                                    }
                                />
                                {eventsToday.length ? (
                                    eventsToday.map((e) => (
                                        <ListLink
                                            key={e.code}
                                            title={e.name}
                                            sub={locationString(e.location)}
                                            onPress={() => openEvent(e.season, e.code, e.name)}
                                        />
                                    ))
                                ) : (
                                    <Txt dim center style={{ paddingVertical: space.md }}>
                                        There are no events scheduled for today.
                                    </Txt>
                                )}
                            </Card>

                            <Card style={{ paddingHorizontal: TABLE_PAD }}>
                                <View style={{ paddingHorizontal: space.md - TABLE_PAD }}>
                                    <View
                                        style={{
                                            paddingBottom: space.sm,
                                            marginBottom: space.sm,
                                            borderBottomWidth: 1,
                                            borderBottomColor: c.textMuted,
                                        }}
                                    >
                                        <Select<RecordMode>
                                            title="World record"
                                            showLabel={false}
                                            plain
                                            value={mode}
                                            onChange={setMode}
                                            groups={[
                                                [
                                                    {
                                                        value: "wo-penalties",
                                                        label: "World Record",
                                                    },
                                                    {
                                                        value: "w-penalties",
                                                        label: "World Record (including penalty points)",
                                                    },
                                                ],
                                            ]}
                                        />
                                    </View>
                                </View>
                                {record ? (
                                    <>
                                        <Press
                                            onPress={() =>
                                                openEvent(
                                                    record.event.season,
                                                    record.event.code,
                                                    record.event.name
                                                )
                                            }
                                            accessibilityRole="link"
                                            style={{
                                                minHeight: 32,
                                                justifyContent: "center",
                                                paddingHorizontal: space.md - TABLE_PAD,
                                            }}
                                        >
                                            <Txt weight="semibold">{record.event.name}</Txt>
                                        </Press>
                                        {rows.map((item) =>
                                            item.kind == "mhead" ? (
                                                <MatchHead key={item.key} />
                                            ) : item.kind == "section" ? (
                                                <MatchSection key={item.key} title={item.title} />
                                            ) : (
                                                <MatchRow
                                                    key={item.key}
                                                    match={item.match}
                                                    timeZone={record.event.timezone}
                                                    last={item.last}
                                                    alliances={0}
                                                    onPress={setOpen}
                                                />
                                            )
                                        )}
                                    </>
                                ) : (
                                    <Txt dim center style={{ paddingVertical: space.md }}>
                                        No matches have been played this season yet.
                                    </Txt>
                                )}
                            </Card>
                        </>
                    );
                }}
            </ScrollScreen>
            <ScoreModal match={open} onClose={() => setOpen(null)} />
        </>
    );
}
