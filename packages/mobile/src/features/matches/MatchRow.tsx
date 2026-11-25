import { memo } from "react";
import { useWindowDimensions, View } from "react-native";
import { CardRow } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { Press } from "@/components/Pressable";
import { Txt } from "@/components/Txt";
import { prettyPrintTime, prettyPrintTimeString } from "@/format";
import { openTeam } from "@/nav";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space, type Palette } from "@/theme/tokens";
import {
    hearts,
    isSolo,
    matchResult,
    rankingDots,
    type Hearts,
    type LostBefore,
    type MatchData,
    type MatchItem,
    type MatchTeam,
    type Winner,
} from "./model";

// Below WIDE_FROM the score goes under the match name and each alliance's teams stack.
const WIDE_FROM = 640;
const HEARTS_W = 16;
const TEAM_LINE_H = 21;
const ROW_PAD = 7;
export const TABLE_PAD = 4;

type Layout = { wide: boolean; matchW: number; labelW: number; scoreW: number };

const NARROW: Layout = { wide: false, matchW: 76, labelW: 76, scoreW: 76 };
const WIDE: Layout = { wide: true, matchW: 150, labelW: 60, scoreW: 90 };

function useLayout(): Layout {
    return useWindowDimensions().width >= WIDE_FROM ? WIDE : NARROW;
}

export function MatchHead({ solo }: { solo?: boolean }) {
    let c = useTheme();
    let l = useLayout();
    let cell = (label: string, bg: string) => (
        <View
            style={{ flex: 1, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}
        >
            <Txt size="sm" weight="bold" color="#ffffff" numberOfLines={1}>
                {label}
            </Txt>
        </View>
    );
    return (
        <View
            style={{
                height: 36,
                flexDirection: "row",
                borderWidth: 1,
                borderBottomWidth: 0,
                borderColor: c.sep,
                borderTopLeftRadius: radius.md,
                borderTopRightRadius: radius.md,
                overflow: "hidden",
            }}
        >
            {l.wide ? (
                <>
                    <View
                        style={{ width: l.labelW, justifyContent: "center", paddingLeft: space.sm }}
                    >
                        <Txt size="sm" weight="bold">
                            Match
                        </Txt>
                    </View>
                    <View
                        style={{ width: l.scoreW, alignItems: "center", justifyContent: "center" }}
                    >
                        <Txt size="sm" weight="bold">
                            Score
                        </Txt>
                    </View>
                </>
            ) : (
                <View style={{ width: l.matchW, alignItems: "center", justifyContent: "center" }}>
                    <Txt size="sm" weight="bold" numberOfLines={1}>
                        Match
                    </Txt>
                </View>
            )}
            {solo ? (
                cell("Team", c.purple)
            ) : (
                <>
                    {cell("Red Alliance", c.red)}
                    {cell("Blue Alliance", c.blue)}
                </>
            )}
        </View>
    );
}

export function MatchSection({ title, solo }: { title: string; solo?: boolean }) {
    let c = useTheme();
    let l = useLayout();
    return (
        <View
            style={{
                height: 34,
                flexDirection: "row",
                borderLeftWidth: 1,
                borderRightWidth: 1,
                borderColor: c.sep,
            }}
            accessible
            accessibilityRole="header"
            accessibilityLabel={title}
        >
            <View style={{ width: l.matchW }} />
            <View style={{ flex: 1, flexDirection: "row" }}>
                {solo ? (
                    <View style={{ flex: 1, backgroundColor: c.purpleTint }} />
                ) : (
                    <>
                        <View style={{ flex: 1, backgroundColor: c.redTint }} />
                        <View style={{ flex: 1, backgroundColor: c.blueTint }} />
                    </>
                )}
                <View
                    style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: 0,
                        bottom: 0,
                        alignItems: "center",
                        justifyContent: "flex-end",
                    }}
                >
                    <View
                        style={{
                            backgroundColor: c.surface,
                            borderRadius: radius.md,
                            paddingHorizontal: space.sm,
                            paddingVertical: 2,
                        }}
                    >
                        <Txt size="sm" numberOfLines={1}>
                            {title}
                        </Txt>
                    </View>
                </View>
            </View>
        </View>
    );
}

function Dots({
    count,
    color,
    align,
}: {
    count: number;
    color: string;
    align: "flex-end" | "flex-start";
}) {
    return (
        <View style={{ flex: 1, height: 4, flexDirection: "row", gap: 2, justifyContent: align }}>
            {Array.from({ length: count }, (_, i) => (
                <View
                    key={i}
                    style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color }}
                />
            ))}
        </View>
    );
}

// Late in the "late" colour and early in the "early" one, by the minute as it's shown.
export function delayColor(c: Palette, delayMs: number): string {
    let mins = Math.round(delayMs / 60000);
    return mins > 0 ? c.late : mins < 0 ? c.early : c.text;
}

function Score({
    match,
    winner,
    c,
    timeZone,
    delayMs,
    width,
}: {
    match: MatchData;
    winner: Winner;
    c: Palette;
    timeZone: string;
    delayMs: number | null;
    width: number;
}) {
    let s = match.scores;

    if (!s) {
        let time: string | null = null;
        let predicted = false;
        if (match.scheduledStartTime) {
            if (delayMs != null) {
                time = prettyPrintTime(
                    new Date(new Date(match.scheduledStartTime).getTime() + delayMs),
                    timeZone
                );
                predicted = true;
            } else {
                time = prettyPrintTimeString(match.scheduledStartTime, timeZone);
            }
        }
        return (
            <View style={{ width, alignItems: "center", justifyContent: "center" }}>
                {time ? (
                    <Txt
                        size="xs"
                        italic={predicted}
                        color={predicted ? delayColor(c, delayMs!) : c.text}
                        accessibilityLabel={predicted ? `expected at ${time}` : `at ${time}`}
                        numberOfLines={1}
                    >
                        {time}
                    </Txt>
                ) : null}
            </View>
        );
    }

    if (!("red" in s)) {
        return (
            <View style={{ width, alignItems: "center", justifyContent: "center" }}>
                <Txt weight="bold" tabular>
                    {s.totalPoints}
                </Txt>
            </View>
        );
    }

    let dots = rankingDots(match);
    let tie = winner == "Tie";
    let number = (points: number, won: boolean, color: string) => (
        <Txt
            size="sm"
            weight={won || tie ? "bold" : "regular"}
            color={tie ? c.purpleText : won ? color : c.text}
            tabular
        >
            {points}
        </Txt>
    );
    return (
        <View style={{ width, alignItems: "center", justifyContent: "center", gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                    {number(s.red.totalPoints, winner == "Red", c.redText)}
                </View>
                <Txt size="sm" style={{ paddingHorizontal: 3 }}>
                    -
                </Txt>
                <View style={{ flex: 1, alignItems: "flex-start" }}>
                    {number(s.blue.totalPoints, winner == "Blue", c.blueText)}
                </View>
            </View>
            {dots ? (
                <View style={{ flexDirection: "row", gap: 5 }}>
                    <Dots count={dots[0]} color={c.redText} align="flex-end" />
                    <Dots count={dots[1]} color={c.blueText} align="flex-start" />
                </View>
            ) : null}
        </View>
    );
}

function HeartPair({
    h,
    color,
    c,
    outcome,
}: {
    h: Hearts;
    color: string;
    c: Palette;
    outcome: "won" | "tied" | null;
}) {
    let first = h.alreadyLost ? "outline" : h.lostThis ? "broken" : "full";
    let second = h.alreadyLost && h.lostThis ? "broken" : "full";
    let label = `${
        h.alreadyLost ? "Had lost once" : h.lostThis ? "Was undefeated" : "Undefeated"
    }, ${
        h.lostThis
            ? "lost this match"
            : outcome == "won"
            ? "won this match"
            : outcome == "tied"
            ? "tied this match"
            : "not played yet"
    }${h.alreadyLost && h.lostThis ? ", eliminated" : ""}`;
    let heart = (kind: string, key: number) => (
        <Icon
            key={key}
            name={kind == "broken" ? "heart-crack" : "heart"}
            solid={kind != "outline"}
            size={9}
            color={kind == "full" ? color : c.textMuted}
        />
    );
    return (
        <View
            style={{ width: HEARTS_W, alignItems: "center", justifyContent: "center", gap: 3 }}
            accessible
            accessibilityLabel={label}
        >
            {heart(first, 0)}
            {heart(second, 1)}
        </View>
    );
}

function TeamCell({
    t,
    c,
    alliance,
    focused,
    won,
    wide,
    season,
    slop,
}: {
    season: number;
    slop?: { top: number; bottom: number };
    t: MatchTeam;
    c: Palette;
    alliance: "red" | "blue" | "solo";
    focused: boolean;
    won: boolean;
    wide: boolean;
}) {
    let fill = alliance == "red" ? c.red : alliance == "blue" ? c.blue : c.purple;
    let out = t.dq || t.noShow;
    let fg = focused ? "#ffffff" : !t.onField ? c.textMuted : c.text;
    let number = (
        <Txt
            size="sm"
            weight={won || focused ? "bold" : "regular"}
            color={fg}
            tabular
            numberOfLines={1}
            style={out ? { textDecorationLine: "line-through" } : null}
        >
            {t.teamNumber}
            {t.surrogate ? "*" : ""}
        </Txt>
    );
    let name = (
        <Txt
            size={wide ? "sm" : "xs"}
            italic
            color={fg}
            numberOfLines={1}
            style={wide ? null : { flex: 1, fontSize: 12 }}
        >
            {t.team.name}
        </Txt>
    );
    return (
        <Press
            onPress={() => openTeam(t.teamNumber, t.team.name, season)}
            accessibilityRole="link"
            hitSlop={slop}
            accessibilityLabel={`Team ${t.teamNumber} ${t.team.name}${
                t.surrogate ? ", surrogate" : ""
            }${t.dq ? ", disqualified" : t.noShow ? ", no show" : ""}`}
            style={
                wide
                    ? {
                          flex: 1,
                          justifyContent: "center",
                          paddingHorizontal: space.sm,
                          backgroundColor: focused ? fill : "transparent",
                      }
                    : {
                          height: TEAM_LINE_H,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 5,
                          paddingHorizontal: 5,
                          backgroundColor: focused ? fill : "transparent",
                      }
            }
        >
            {number}
            {name}
        </Press>
    );
}

const ROLES = ["Captain", "FirstPick", "SecondPick"];

function roleOrder(t: MatchTeam): number {
    let i = ROLES.indexOf(t.allianceRole ?? "");
    return i == -1 ? ROLES.length : i;
}

type MatchRowProps = {
    match: MatchData;
    timeZone: string;
    focusedTeam?: number | null;
    delayMs?: number | null;
    zebra?: boolean;
    alliances?: number;
    lostBefore?: LostBefore | null;
    newRound?: boolean;
    last?: boolean;
    onPress: (match: MatchData) => void;
};

export const MatchRow = memo(function MatchRow({
    match,
    timeZone,
    focusedTeam = null,
    delayMs = null,
    zebra,
    alliances = 0,
    lostBefore = null,
    newRound,
    last,
    onPress,
}: MatchRowProps) {
    let c = useTheme();
    let l = useLayout();
    let s = match.scores;
    let winner = matchResult(match);
    let solo = winner == "Solo" || isSolo([match]);
    // The API's team order changes between matches, so sort by alliance role.
    let side = (a: "Red" | "Blue") =>
        match.teams.filter((t) => t.alliance == a).sort((x, y) => roleOrder(x) - roleOrder(y));
    let red = side("Red");
    let blue = side("Blue");
    let lives = hearts(match, alliances, lostBefore);
    let labelColor =
        winner == "Red"
            ? c.redText
            : winner == "Blue"
            ? c.blueText
            : winner == "Tie"
            ? c.purpleText
            : c.text;
    let canOpen = !!s;

    let label = (
        <Txt
            size={l.wide ? "sm" : "md"}
            weight="bold"
            color={labelColor}
            numberOfLines={1}
            accessibilityLabel={`Match ${match.description}`}
        >
            {match.description}
        </Txt>
    );
    let tint = {
        red: zebra ? c.redTintZebra : c.redTint,
        blue: zebra ? c.blueTintZebra : c.blueTint,
        solo: c.purpleTint,
    };
    let alliance = (side: "red" | "blue" | "solo", teams: MatchTeam[], h: Hearts | null) => (
        <View style={{ flex: 1, flexDirection: "row", backgroundColor: tint[side] }}>
            {h ? (
                <HeartPair
                    h={h}
                    color={side == "red" ? c.redText : c.blueText}
                    c={c}
                    outcome={winner == "Tie" ? "tied" : winner ? "won" : null}
                />
            ) : null}
            <View
                style={{
                    flex: 1,
                    flexDirection: l.wide ? "row" : "column",
                    justifyContent: "center",
                    paddingVertical: l.wide ? 0 : ROW_PAD,
                }}
            >
                {teams.map((t, i) => (
                    <TeamCell
                        key={t.teamNumber}
                        // The first and last lines also get the row's padding as touch area.
                        slop={
                            l.wide
                                ? undefined
                                : {
                                      top: i == 0 ? ROW_PAD : 0,
                                      bottom: i == teams.length - 1 ? ROW_PAD : 0,
                                  }
                        }
                        t={t}
                        c={c}
                        alliance={side}
                        focused={t.teamNumber == focusedTeam}
                        won={
                            (side == "red" && winner == "Red") ||
                            (side == "blue" && winner == "Blue")
                        }
                        wide={l.wide}
                        season={match.season}
                    />
                ))}
            </View>
        </View>
    );

    return (
        <View
            style={{
                minHeight: l.wide ? 44 : 2 * TEAM_LINE_H + 2 * ROW_PAD,
                flexDirection: "row",
                backgroundColor: zebra ? c.zebra : c.surface,
                borderLeftWidth: 1,
                borderRightWidth: 1,
                borderBottomWidth: last ? 1 : 0,
                borderTopWidth: newRound ? 1 : 0,
                borderColor: c.sep,
                borderBottomLeftRadius: last ? radius.md : 0,
                borderBottomRightRadius: last ? radius.md : 0,
                overflow: "hidden",
            }}
        >
            <Press
                onPress={() => onPress(match)}
                disabled={!canOpen}
                accessibilityRole="button"
                // Unplayed, its name and time are read as they are shown.
                accessibilityLabel={
                    !s
                        ? undefined
                        : `Match ${match.description}, ${
                              solo
                                  ? `score ${s.totalPoints}`
                                  : `red ${s.red.totalPoints}, blue ${s.blue.totalPoints}`
                          }. Score breakdown`
                }
                style={
                    l.wide
                        ? { flexDirection: "row" }
                        : {
                              width: l.matchW,
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 2,
                          }
                }
            >
                {l.wide ? (
                    <View
                        style={{ width: l.labelW, justifyContent: "center", paddingLeft: space.sm }}
                    >
                        {label}
                    </View>
                ) : (
                    label
                )}
                <Score
                    match={match}
                    winner={winner}
                    c={c}
                    timeZone={timeZone}
                    delayMs={delayMs}
                    width={l.scoreW}
                />
            </Press>
            {solo ? (
                alliance("solo", match.teams, null)
            ) : (
                <>
                    {alliance("red", red, lives?.red ?? null)}
                    {alliance("blue", blue, lives?.blue ?? null)}
                </>
            )}
        </View>
    );
});

export function MatchTableItem({
    item,
    timeZone,
    focusedTeam,
    onPress,
}: {
    item: MatchItem;
    timeZone: string;
    focusedTeam?: number | null;
    onPress: (match: MatchData) => void;
}) {
    return (
        <CardRow pad={TABLE_PAD}>
            {item.kind == "mhead" ? (
                <MatchHead solo={item.solo} />
            ) : item.kind == "section" ? (
                <MatchSection title={item.title} solo={item.solo} />
            ) : (
                <MatchRow
                    match={item.match}
                    timeZone={timeZone}
                    focusedTeam={focusedTeam}
                    delayMs={item.delayMs}
                    zebra={item.zebra}
                    alliances={item.alliances}
                    lostBefore={item.lostBefore}
                    newRound={item.newRound}
                    last={item.last}
                    onPress={onPress}
                />
            )}
        </CardRow>
    );
}

export function MatchLegend({ matches }: { matches: MatchData[] }) {
    let c = useTheme();
    // A remote event's unplayed matches are marked no-show and aren't in the table.
    if (isSolo(matches)) matches = matches.filter((m) => m.scores);
    let anySurrogate = matches.some((m) => m.teams.some((t) => t.surrogate));
    let anyDq = matches.some((m) => m.teams.some((t) => t.dq || t.noShow));
    let anyElim = matches.some((m) => m.tournamentLevel == "DoubleElim");
    if (!anySurrogate && !anyDq && !anyElim) return null;
    let heart = (name: "heart" | "heart-crack", solid: boolean, color: string, label: string) => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon name={name} solid={solid} size={11} color={color} />
            <Txt size="sm">{label}</Txt>
        </View>
    );
    return (
        <View
            style={{
                flexDirection: "row",
                flexWrap: "wrap",
                columnGap: space.md,
                rowGap: space.xs,
                paddingTop: space.sm,
            }}
        >
            {anyElim ? heart("heart", true, c.redText, "Elimination Remaining") : null}
            {anyElim ? heart("heart-crack", true, c.textMuted, "Lost This Match") : null}
            {anyElim ? heart("heart", false, c.textMuted, "Lost Previous Match") : null}
            {anySurrogate ? <Txt size="sm">* Surrogate</Txt> : null}
            {anyDq ? (
                <Txt size="sm">
                    <Txt size="sm" style={{ textDecorationLine: "line-through" }}>
                        12345
                    </Txt>{" "}
                    Disqualified or No Show
                </Txt>
            ) : null}
        </View>
    );
}
