import {
    SortDir,
    type StatColumn,
    type StatData,
    type StatSet,
    type StatValue,
} from "@ftc-scout/common";
import { FlashList } from "@shopify/flash-list";
import {
    memo,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactElement,
    type ReactNode,
} from "react";
import { Animated, useWindowDimensions, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Icon } from "@/components/Icon";
import { Press } from "@/components/Pressable";
import { Txt } from "@/components/Txt";
import { prettyPrintFloat, prettyPrintOrdinal } from "@/format";
import { setTableView, settings } from "@/store/settings";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space, type Palette, type StatColor } from "@/theme/tokens";
import { cellWidth, units } from "./columns";
import type { Sort } from "./localSort";

// Below WIDE_FROM each team can be a block with its stats scrolling under it; wider gets a table.
const WIDE_FROM = 640;

const BLOCK_PAD = 8;
const LEAD_LINE = 26;
const LEAD_GAP = 5;
const CHIP = 26;
const STACKED_ROW = 2 * BLOCK_PAD + LEAD_LINE + LEAD_GAP + CHIP + 1;
const STACKED_HEAD_LEAD = 34;
const STACKED_HEAD = 44;
const RANK_BADGE = 46;
const INSET = 6;
const CHIP_GAP = 4;
const FADE = 22;

const ROW_HEIGHT = 46;
const HEADER_HEIGHT = 44;
const HEADING_SLOP = { top: 6, bottom: 6 };
const CELL_WIDTH = 78;
const RANK_WIDTH = 56;
const PHONE_RANK_WIDTH = 52;
const PHONE_LEAD_WIDTH = 106;

const FOOTER_ROOM = 70;
// Card margins, padding and borders: how much narrower than the screen a table is.
const USUAL_MARGINS = 2 * 8 + 2 * 4 + 4;
const FIRST_ROWS = 16;
const MORE_ROWS = 60;

function formatStat(val: StatValue | null): string {
    if (val == null) return "N/A";
    switch (val.ty) {
        case "rank":
            return val.val ? prettyPrintOrdinal(val.val) : "";
        case "float":
            return prettyPrintFloat(val.val);
        case "int":
        case "string":
            return String(val.val);
        case "record":
            return `${val.wins}-${val.losses}-${val.ties}`;
        case "team":
            return `${val.number}`;
        case "event":
            return val.name;
    }
}

export type Lead<T> = {
    title: string;
    width: number;
    phoneWidth?: number;
    sortId?: string;
    rankSortId?: string;
    /** Rank to show when it isn't the row's sorted position, e.g. a team's event rank. */
    rank?: (row: StatData<T>) => number | null | undefined;
    render: (row: StatData<T>, stacked: boolean) => ReactNode;
    onPress?: (row: StatData<T>) => void;
    label?: (row: StatData<T>) => string;
};

type RowProps<T> = {
    row: StatData<T>;
    columns: StatColumn<T>[];
    lead: Lead<T>;
    c: Palette;
    zebra: boolean;
    scrollX: Animated.Value;
    viewport: number;
    cell: number;
    leadWidth: number;
    rankWidth: number;
    stacked: boolean;
};

function Cell<T>({
    stat,
    row,
    c,
    zebra,
    width,
    stacked,
}: {
    stat: StatColumn<T>;
    row: StatData<T>;
    c: Palette;
    zebra: boolean;
    width: number;
    stacked: boolean;
}) {
    let val = stat.getValue(row);
    let colors = c.stat[stat.color as StatColor] ?? c.stat.white;
    let wide = !!val && (val.ty == "team" || val.ty == "event");
    // Read with its column's name, which a screen reader doesn't take from the heading.
    let a11y = {
        accessible: true,
        accessibilityLabel: `${stat.titleName}, ${
            val?.ty == "team" ? `${val.number} ${val.name}` : formatStat(val)
        }`,
    };
    let content =
        val == null ? (
            <Txt size="sm" color={c.textSecondary}>
                {stat.ty == "rank" ? "" : "N/A"}
            </Txt>
        ) : val.ty == "team" ? (
            stacked ? (
                <Txt size="sm" numberOfLines={1}>
                    <Txt size="sm" tabular>
                        {val.number}
                    </Txt>{" "}
                    <Txt size="xs" italic>
                        {val.name}
                    </Txt>
                </Txt>
            ) : (
                <>
                    <Txt size="sm" tabular numberOfLines={1}>
                        {val.number}
                    </Txt>
                    <Txt size="xs" italic numberOfLines={1}>
                        {val.name}
                    </Txt>
                </>
            )
        ) : (
            <Txt
                weight={val.ty == "rank" ? "bold" : "regular"}
                size={stacked && formatStat(val).length > 6 ? "xs" : "sm"}
                tabular
                numberOfLines={stacked ? 1 : 2}
            >
                {formatStat(val)}
            </Txt>
        );

    if (stacked) {
        return (
            <View style={{ width, paddingHorizontal: CHIP_GAP / 2 }} {...a11y}>
                <View
                    style={{
                        height: CHIP,
                        borderRadius: 6,
                        alignItems: wide ? "flex-start" : "center",
                        justifyContent: "center",
                        paddingHorizontal: wide ? 8 : 2,
                        backgroundColor: stat.color == "white" ? c.raised : colors.tint,
                    }}
                >
                    {content}
                </View>
            </View>
        );
    }
    return (
        <View
            style={{
                width,
                alignItems: wide ? "flex-start" : "center",
                justifyContent: "center",
                paddingHorizontal: wide ? 6 : 2,
                backgroundColor: zebra ? colors.tintZebra : colors.tint,
            }}
            {...a11y}
        >
            {content}
        </View>
    );
}

const Row = memo(function Row<T>({
    row,
    columns,
    lead,
    c,
    zebra,
    scrollX,
    viewport,
    cell,
    leadWidth,
    rankWidth,
    stacked,
}: RowProps<T>) {
    let bg = zebra ? c.zebra : c.surface;
    let rank = lead.rank ? lead.rank(row) : row.filterRank || row.noFilterRank;
    let rankText = (
        <Txt size="sm" weight="bold" color={c.text} tabular numberOfLines={1}>
            {rank ? prettyPrintOrdinal(rank) : ""}
        </Txt>
    );
    let press = (inner: ReactElement) =>
        lead.onPress ? (
            <Press
                onPress={() => lead.onPress!(row)}
                accessibilityRole="link"
                accessibilityLabel={lead.label?.(row)}
                style={{ flex: 1 }}
            >
                {inner}
            </Press>
        ) : (
            inner
        );

    if (stacked) {
        return (
            <View
                style={{
                    height: STACKED_ROW,
                    backgroundColor: c.surface,
                    borderTopWidth: 1,
                    borderTopColor: c.sep,
                }}
            >
                {/* Counter the horizontal scroll so the team line stays put. */}
                <Animated.View
                    style={{
                        height: BLOCK_PAD + LEAD_LINE + LEAD_GAP,
                        width: viewport,
                        transform: [{ translateX: scrollX }],
                    }}
                >
                    {press(
                        <View
                            style={{
                                flex: 1,
                                flexDirection: "row",
                                alignItems: "center",
                                gap: space.sm,
                                paddingTop: BLOCK_PAD,
                                paddingBottom: LEAD_GAP,
                                paddingHorizontal: INSET + CHIP_GAP / 2,
                            }}
                        >
                            <View
                                style={{
                                    width: RANK_BADGE,
                                    height: LEAD_LINE - 2,
                                    borderRadius: 6,
                                    alignItems: "center",
                                    justifyContent: "center",
                                    backgroundColor: c.raised,
                                }}
                            >
                                {rankText}
                            </View>
                            <View style={{ flex: 1 }}>{lead.render(row, true)}</View>
                        </View>
                    )}
                </Animated.View>
                <View style={{ height: CHIP, flexDirection: "row", paddingHorizontal: INSET }}>
                    {columns.map((stat) => (
                        <Cell
                            key={stat.id}
                            stat={stat}
                            row={row}
                            c={c}
                            zebra={false}
                            width={units(stat) * cell}
                            stacked
                        />
                    ))}
                </View>
            </View>
        );
    }

    return (
        <View
            style={{
                height: ROW_HEIGHT,
                flexDirection: "row",
                paddingLeft: leadWidth,
                backgroundColor: bg,
            }}
        >
            {columns.map((stat) => (
                <Cell
                    key={stat.id}
                    stat={stat}
                    row={row}
                    c={c}
                    zebra={zebra}
                    width={units(stat) * cell}
                    stacked={false}
                />
            ))}
            <Animated.View
                style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: leadWidth,
                    transform: [{ translateX: scrollX }],
                    backgroundColor: bg,
                    borderRightWidth: 1,
                    borderRightColor: c.sep,
                }}
            >
                {press(
                    <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
                        <View style={{ width: rankWidth, alignItems: "center" }}>{rankText}</View>
                        <View style={{ flex: 1, paddingLeft: space.sm, paddingRight: space.sm }}>
                            {lead.render(row, false)}
                        </View>
                    </View>
                )}
            </Animated.View>
        </View>
    );
}) as <T>(p: RowProps<T>) => ReactElement;

function SortMark({ sort, id, color }: { sort: Sort; id: string; color: string }) {
    if (sort.id != id) return <Icon name="sort" size={10} color={color} />;
    return (
        <Icon name={sort.dir == SortDir.Asc ? "sort-up" : "sort-down"} size={10} color={color} />
    );
}

function EdgeFade({
    side,
    top,
    opacity,
    color,
    strength,
}: {
    side: "left" | "right";
    top: number;
    opacity: Animated.AnimatedInterpolation<number>;
    color: string;
    strength: number;
}) {
    let id = `fade-${side}`;
    return (
        <Animated.View
            pointerEvents="none"
            style={{ position: "absolute", top, bottom: 0, [side]: 0, width: FADE, opacity }}
        >
            <Svg width={FADE} height="100%">
                <Defs>
                    <LinearGradient
                        id={id}
                        x1={side == "right" ? "0" : "1"}
                        y1="0"
                        x2={side == "right" ? "1" : "0"}
                        y2="0"
                    >
                        <Stop offset="0" stopColor={color} stopOpacity={0} />
                        <Stop offset="1" stopColor={color} stopOpacity={strength} />
                    </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width={FADE} height="100%" fill={`url(#${id})`} />
            </Svg>
        </Animated.View>
    );
}

export function StatTable<T>({
    stats,
    columnIds,
    rows,
    sort,
    onSort,
    lead,
    onEndReached,
    footer,
    refreshing,
    onRefresh,
    rowKey,
    inline,
}: {
    stats: StatSet<T>;
    columnIds: string[];
    rows: StatData<T>[];
    sort: Sort;
    onSort: (id: string) => void;
    lead: Lead<T>;
    onEndReached?: () => void;
    footer?: ReactElement | null;
    refreshing?: boolean;
    onRefresh?: () => void;
    rowKey: (row: StatData<T>, index: number) => string;
    /** Let the parent page do the scrolling instead of giving the table its own scroll view. */
    inline?: boolean;
}) {
    let c = useTheme();
    let scrollX = useRef(new Animated.Value(0)).current;
    // Guess the width from the window so the first frame doesn't wait on layout.
    let windowWidth = useWindowDimensions().width;
    let [measured, setMeasured] = useState<number | null>(null);
    let viewport = measured ?? Math.max(0, Math.floor(windowWidth) - USUAL_MARGINS);

    // Draw the first screenful right away and the rest after, so opening a tab isn't slow.
    let [drawn, setDrawn] = useState(FIRST_ROWS);
    useEffect(() => {
        if (!inline || drawn >= rows.length) return;
        let t = setTimeout(() => setDrawn((n) => n + MORE_ROWS), 30);
        return () => clearTimeout(t);
    }, [inline, drawn, rows.length]);
    let columns = useMemo(
        () => columnIds.map((id) => stats.getStat(id)).filter((s) => !!s),
        [columnIds, stats]
    );

    let phone = viewport < WIDE_FROM;
    // Read unconditionally: the phone/tablet split can change when the device rotates.
    let tableView = settings.useValue().tableView;
    let stacked = phone && tableView == "cards";
    let totalUnits = columns.reduce((sum, s) => sum + units(s), 0);
    let rankWidth = phone ? PHONE_RANK_WIDTH : RANK_WIDTH;
    let leadWidth = rankWidth + (phone ? lead.phoneWidth ?? PHONE_LEAD_WIDTH : lead.width);
    let cell = stacked
        ? cellWidth(viewport - 2 * INSET, totalUnits)
        : phone
        ? cellWidth(viewport - leadWidth, totalUnits)
        : CELL_WIDTH;
    let total = stacked ? totalUnits * cell + 2 * INSET : leadWidth + totalUnits * cell;
    let maxScroll = Math.max(0, Math.round(total - viewport));

    let headHeight = stacked ? STACKED_HEAD_LEAD + STACKED_HEAD : HEADER_HEIGHT;
    let height =
        headHeight +
        rows.length * (stacked ? STACKED_ROW : ROW_HEIGHT) +
        (footer ? FOOTER_ROOM : 0) +
        2;

    let heading = (stat: StatColumn<T>, w: number) => {
        let white = stat.color == "white";
        let fg = white ? c.text : "#ffffff";
        let fill = white ? c.raised : c.stat[stat.color as StatColor].fill;
        let sorted = sort.id == stat.id;
        let long = stat.columnName.length > 14 || stat.columnName.split(" ").length > 2;
        let inner = (
            <>
                <Txt
                    size={long ? "xs" : "sm"}
                    weight="bold"
                    color={fg}
                    center
                    numberOfLines={long ? 3 : 2}
                    style={{ flexShrink: 1 }}
                >
                    {stat.columnName}
                </Txt>
                {!phone || sorted ? <SortMark sort={sort} id={stat.id} color={fg} /> : null}
            </>
        );
        return (
            <Press
                key={stat.id}
                onPress={() => onSort(stat.id)}
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${stat.titleName}`}
                hitSlop={HEADING_SLOP}
                style={
                    stacked
                        ? { width: w, paddingHorizontal: CHIP_GAP / 2 }
                        : {
                              width: w,
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 3,
                              paddingHorizontal: 2,
                              backgroundColor: fill,
                          }
                }
            >
                {stacked ? (
                    <View
                        style={{
                            flex: 1,
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 3,
                            paddingHorizontal: 2,
                            borderRadius: 6,
                            backgroundColor: fill,
                        }}
                    >
                        {inner}
                    </View>
                ) : (
                    inner
                )}
            </Press>
        );
    };

    let leadHeadings = (
        <>
            <Press
                onPress={() => lead.rankSortId && onSort(lead.rankSortId)}
                disabled={!lead.rankSortId}
                accessibilityRole="button"
                accessibilityLabel={lead.rankSortId ? "Sort by rank" : "Rank"}
                hitSlop={HEADING_SLOP}
                style={
                    stacked
                        ? {
                              width: RANK_BADGE + space.sm + INSET + CHIP_GAP / 2,
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 4,
                              paddingLeft: INSET + CHIP_GAP / 2 + 4,
                          }
                        : {
                              width: rankWidth,
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 4,
                          }
                }
            >
                <Txt size="sm" weight="bold">
                    Rank
                </Txt>
                {lead.rankSortId && sort.id == lead.rankSortId ? (
                    <SortMark sort={sort} id={lead.rankSortId} color={c.text} />
                ) : null}
            </Press>
            <Press
                onPress={() => lead.sortId && onSort(lead.sortId)}
                disabled={!lead.sortId}
                accessibilityRole="button"
                accessibilityLabel={lead.sortId ? `Sort by ${lead.title}` : lead.title}
                hitSlop={HEADING_SLOP}
                style={
                    stacked
                        ? {
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 4,
                              paddingRight: space.md,
                          }
                        : {
                              flex: 1,
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 4,
                          }
                }
            >
                <Txt size="sm" weight="bold" numberOfLines={1}>
                    {lead.title}
                </Txt>
                {lead.sortId ? <SortMark sort={sort} id={lead.sortId} color={c.text} /> : null}
            </Press>
        </>
    );

    let renderRow = (item: StatData<T>, index: number) => (
        <Row
            key={inline ? rowKey(item, index) : undefined}
            row={item}
            columns={columns}
            lead={lead}
            c={c}
            zebra={index % 2 == 1}
            scrollX={scrollX}
            viewport={viewport}
            cell={cell}
            leadWidth={leadWidth}
            rankWidth={rankWidth}
            stacked={stacked}
        />
    );
    let list = inline ? (
        <View>{rows.slice(0, drawn).map(renderRow)}</View>
    ) : (
        <FlashList
            data={rows}
            keyExtractor={rowKey}
            extraData={[c, columns, sort, viewport]}
            renderItem={({ item, index }) => renderRow(item, index)}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.6}
            ListFooterComponent={footer}
            refreshing={refreshing}
            onRefresh={onRefresh}
            style={{ flex: 1 }}
        />
    );

    let edge = Math.min(24, maxScroll);
    let rightFade = scrollX.interpolate({
        inputRange: [maxScroll - edge, maxScroll],
        outputRange: [1, 0],
        extrapolate: "clamp",
    });
    let leftFade = scrollX.interpolate({
        inputRange: [0, edge || 1],
        outputRange: [0, 1],
        extrapolate: "clamp",
    });

    return (
        <View
            onLayout={(e) => {
                let w = Math.max(0, Math.floor(e.nativeEvent.layout.width) - 2);
                if (w != viewport) setMeasured(w);
            }}
            style={{
                ...(inline ? null : { flexGrow: 0, flexShrink: 1, flexBasis: height }),
                borderWidth: 1,
                borderColor: c.sep,
                borderRadius: radius.md,
                overflow: "hidden",
            }}
        >
            {viewport > 0 ? (
                <>
                    <Animated.ScrollView
                        horizontal
                        bounces={false}
                        overScrollMode="never"
                        showsHorizontalScrollIndicator
                        persistentScrollbar
                        scrollEventThrottle={16}
                        onScroll={Animated.event(
                            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                            { useNativeDriver: true }
                        )}
                        style={{ flex: inline ? undefined : 1, backgroundColor: c.surface }}
                        contentContainerStyle={{ minWidth: "100%" }}
                    >
                        <View style={{ width: total, minWidth: "100%" }}>
                            {stacked ? (
                                <View style={{ zIndex: 1 }}>
                                    <Animated.View
                                        style={{
                                            height: STACKED_HEAD_LEAD,
                                            width: viewport,
                                            flexDirection: "row",
                                            transform: [{ translateX: scrollX }],
                                            backgroundColor: c.surface,
                                        }}
                                    >
                                        {leadHeadings}
                                        {maxScroll > 0 ? (
                                            <View
                                                style={{
                                                    flex: 1,
                                                    flexDirection: "row",
                                                    alignItems: "center",
                                                    justifyContent: "flex-end",
                                                    gap: 5,
                                                    paddingRight: space.sm,
                                                }}
                                            >
                                                <Txt size="xs" dim numberOfLines={1}>
                                                    {columns.length} stats · swipe
                                                </Txt>
                                                <Icon
                                                    name="arrows-left-right"
                                                    size={11}
                                                    color={c.textSecondary}
                                                />
                                            </View>
                                        ) : null}
                                    </Animated.View>
                                    <View
                                        style={{
                                            height: STACKED_HEAD,
                                            flexDirection: "row",
                                            paddingHorizontal: INSET,
                                            paddingBottom: 6,
                                            backgroundColor: c.surface,
                                        }}
                                    >
                                        {columns.map((stat) => heading(stat, units(stat) * cell))}
                                    </View>
                                </View>
                            ) : (
                                <View
                                    style={{
                                        height: HEADER_HEIGHT,
                                        flexDirection: "row",
                                        paddingLeft: leadWidth,
                                        zIndex: 1,
                                    }}
                                >
                                    {columns.map((stat) => heading(stat, units(stat) * cell))}
                                    <Animated.View
                                        style={{
                                            position: "absolute",
                                            left: 0,
                                            top: 0,
                                            bottom: 0,
                                            width: leadWidth,
                                            flexDirection: "row",
                                            transform: [{ translateX: scrollX }],
                                            backgroundColor: c.surface,
                                            borderRightWidth: 1,
                                            borderRightColor: c.sep,
                                        }}
                                    >
                                        {leadHeadings}
                                    </Animated.View>
                                </View>
                            )}
                            {list}
                        </View>
                    </Animated.ScrollView>
                    {maxScroll > 0 ? (
                        <>
                            <EdgeFade
                                side="right"
                                top={stacked ? STACKED_HEAD_LEAD : 0}
                                opacity={rightFade}
                                color={c.fade}
                                strength={c.fadeStrength}
                            />
                            {stacked ? (
                                <EdgeFade
                                    side="left"
                                    top={STACKED_HEAD_LEAD}
                                    opacity={leftFade}
                                    color={c.fade}
                                    strength={c.fadeStrength}
                                />
                            ) : null}
                        </>
                    ) : null}
                </>
            ) : null}
        </View>
    );
}

export function TableViewToggle() {
    let c = useTheme();
    let view = settings.useValue().tableView;
    let { width } = useWindowDimensions();
    if (width - USUAL_MARGINS >= WIDE_FROM) return null;
    let option = (id: "cards" | "table", icon: "bars-staggered" | "table-cells", label: string) => {
        let on = view == id;
        return (
            <Press
                onPress={() => setTableView(id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={label}
                style={{
                    width: 44,
                    height: 36,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: on ? c.theme : "transparent",
                }}
            >
                <Icon name={icon} size={15} color={on ? c.onTheme : c.text} />
            </Press>
        );
    };
    return (
        <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Table layout"
            style={{
                flexDirection: "row",
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: c.sep,
                backgroundColor: c.form,
                overflow: "hidden",
            }}
        >
            {option("cards", "bars-staggered", "Blocks: a team per block, more stats at once")}
            {option("table", "table-cells", "Table: the website's columns")}
        </View>
    );
}
