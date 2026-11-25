import { DESCRIPTORS, type ScoreModalComponent, type Season, type Tree } from "@ftc-scout/common";
import { useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { Icon } from "@/components/Icon";
import { Popup } from "@/components/Popup";
import { Press } from "@/components/Pressable";
import { Txt } from "@/components/Txt";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";
import { rpLabel, type MatchData } from "./model";
import { RankingPointIcon, RP_TILE } from "./RankingPointIcon";

const VALUE_W = 68;

// Which breakdown lines are open, kept while the app runs as on the website.
// Popups render from a copy in state, because the React Compiler caches reads of anything else.
let openLines: Record<string, boolean> = {};

function Line({
    prop,
    scores,
    heading,
    sub,
    remote,
    expandable,
    open,
    onToggle,
}: {
    prop: ScoreModalComponent;
    scores: any;
    heading?: boolean;
    sub?: boolean;
    remote: boolean;
    expandable?: boolean;
    open?: boolean;
    onToggle?: () => void;
}) {
    let c = useTheme();
    let name = remote ? prop.remoteDisplayName : prop.displayName;
    let cells = remote
        ? [[scores, c.purpleTint, c.purpleText] as const]
        : [
              [scores.red, heading ? c.redTintZebra : c.redTint, c.redText] as const,
              [scores.blue, heading ? c.blueTintZebra : c.blueTint, c.blueText] as const,
          ];
    // Read as one line, so the values are heard with their alliance.
    let values = cells.map(([s]) => prop.getValue(s) ?? 0);
    let said = remote ? `${name}, ${values[0]}` : `${name}, red ${values[0]}, blue ${values[1]}`;
    let row = (
        <View
            style={{
                flexDirection: "row",
                minHeight: expandable ? 40 : 32,
                backgroundColor: heading ? c.zebra : c.surface,
            }}
            accessible={!expandable}
            accessibilityRole={heading ? "header" : undefined}
            accessibilityLabel={expandable ? undefined : said}
        >
            <View
                style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingLeft: heading ? space.sm : sub ? space.xxl + space.sm : space.sm,
                    paddingRight: space.xs,
                }}
            >
                {heading ? null : (
                    <View style={{ width: 12 }}>
                        {expandable ? (
                            <Icon
                                name={open ? "caret-down" : "caret-right"}
                                size={12}
                                color={c.text}
                            />
                        ) : null}
                    </View>
                )}
                <Txt
                    weight={heading ? "bold" : "regular"}
                    size={sub ? "sm" : "md"}
                    style={{ flex: 1 }}
                >
                    {name}
                </Txt>
            </View>
            {cells.map(([, bg, color], i) => {
                let v = values[i];
                return (
                    <View
                        key={i}
                        style={{
                            width: VALUE_W,
                            backgroundColor: bg,
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <Txt
                            weight={v ? "bold" : "regular"}
                            color={v ? color : c.textMuted}
                            tabular
                        >
                            {sub && v ? "+" : ""}
                            {v}
                        </Txt>
                    </View>
                );
            })}
        </View>
    );
    if (!expandable) return row;
    return (
        <Press
            onPress={onToggle}
            accessibilityRole="button"
            accessibilityState={{ expanded: !!open }}
            accessibilityLabel={said}
            accessibilityHint="Shows its parts"
        >
            {row}
        </Press>
    );
}

function Breakdown({ scores, season, remote }: { scores: any; season: Season; remote: boolean }) {
    let [open, setOpen] = useState(openLines);
    let toggle = (key: string) => {
        let next = { ...open, [key]: !open[key] };
        openLines = next;
        setOpen(next);
    };
    let tree: Tree<ScoreModalComponent>[] = DESCRIPTORS[season].getSCoreModalTree(remote);
    return (
        <View>
            {tree.map((top) => (
                <View key={top.val.id}>
                    <Line prop={top.val} scores={scores} heading remote={remote} />
                    {top.children.map((line) => {
                        let key = `${season}-${line.val.id}`;
                        let isOpen = !!open[key];
                        return (
                            <View key={line.val.id}>
                                <Line
                                    prop={line.val}
                                    scores={scores}
                                    remote={remote}
                                    expandable={line.children.length > 0}
                                    open={isOpen}
                                    onToggle={() => toggle(key)}
                                />
                                {isOpen
                                    ? line.children.map((s) => (
                                          <Line
                                              key={s.val.id}
                                              prop={s.val}
                                              scores={scores}
                                              sub
                                              remote={remote}
                                          />
                                      ))
                                    : null}
                            </View>
                        );
                    })}
                </View>
            ))}
        </View>
    );
}

const RP_GAP = 4;
const RP_MIDDLE = 12;

function RankingPoints({ scores, season, width }: { scores: any; season: Season; width: number }) {
    let c = useTheme();
    let rps = DESCRIPTORS[season].rankingPoints?.filter(
        (rp) => rp.id in scores.red || rp.id in scores.blue
    );
    if (!rps?.length) return null;
    let half = (width - RP_MIDDLE) / 2;
    let size = Math.max(28, Math.min(RP_TILE, Math.floor(half / rps.length) - RP_GAP));
    let small = size < 46;
    let side = (s: any, fill: string, alliance: string) => (
        <View style={{ flex: 1, flexDirection: "row", justifyContent: "center" }}>
            {rps!.map((rp) => {
                let on = !!s[rp.id];
                return (
                    <View
                        key={rp.id}
                        style={{ width: size + RP_GAP, alignItems: "center" }}
                        accessible
                        accessibilityLabel={`${alliance} Alliance ${rp.name}: ${
                            on ? "Achieved" : "Not Achieved"
                        }`}
                    >
                        <RankingPointIcon id={rp.id} active={on} fill={fill} size={size} />
                        <Txt
                            center
                            numberOfLines={2}
                            style={{ marginTop: 3, fontSize: small ? 9 : 10, lineHeight: 12 }}
                        >
                            {rpLabel(rp.name)}
                        </Txt>
                    </View>
                );
            })}
        </View>
    );
    return (
        <View style={{ flexDirection: "row", marginTop: space.md, gap: RP_MIDDLE }}>
            {side(scores.red, c.stat.red.fill, "Red")}
            {side(scores.blue, c.stat.blue.fill, "Blue")}
        </View>
    );
}

export function ScoreModal({
    match,
    onClose,
    scoresReady = true,
    scoresFailed,
}: {
    match: MatchData | null;
    onClose: () => void;
    /** False while only the lean query has loaded: totals but no breakdown. */
    scoresReady?: boolean;
    scoresFailed?: import("react").ReactNode;
}) {
    let c = useTheme();
    let { width: windowWidth } = useWindowDimensions();
    if (!match) return <Popup visible={false} onClose={onClose} title="" children={null} />;

    let s = match.scores;
    let remote = !!s && !("red" in s);
    let season = match.season as Season;
    let totals: (readonly [string, string, number])[] = !s
        ? []
        : remote
        ? [["Score", c.purple, s.totalPoints]]
        : [
              ["Red", c.red, s.red.totalPoints],
              ["Blue", c.blue, s.blue.totalPoints],
          ];

    // Must match Popup's margins and padding.
    let contentWidth = Math.min(windowWidth - 2 * space.md, 560) - 2 * space.sm;

    return (
        <Popup visible onClose={onClose} title={`Match ${match.description}`}>
            {s ? (
                <>
                    <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                        {totals.map(([name, fill, total]) => (
                            <View
                                key={name}
                                style={{
                                    width: VALUE_W,
                                    backgroundColor: fill,
                                    alignItems: "center",
                                    paddingVertical: 3,
                                }}
                                accessibilityLabel={`${name} total ${total}`}
                            >
                                <Txt size="sm" color="#ffffff">
                                    {name}
                                </Txt>
                                <Txt weight="bold" color="#ffffff" tabular>
                                    {total}
                                </Txt>
                            </View>
                        ))}
                    </View>
                    {scoresReady ? (
                        <>
                            <Breakdown scores={s} season={season} remote={remote} />
                            {!remote && match.tournamentLevel == "Quals" ? (
                                <RankingPoints scores={s} season={season} width={contentWidth} />
                            ) : null}
                        </>
                    ) : scoresFailed ? (
                        scoresFailed
                    ) : (
                        <View style={{ padding: space.lg }}>
                            <Txt dim center>
                                Loading the breakdown…
                            </Txt>
                        </View>
                    )}
                </>
            ) : null}
        </Popup>
    );
}
