import {
    DESCRIPTORS,
    getMatchStatSet,
    getTepStatSet,
    SortDir,
    type Season,
    type StatData,
    type StatSet,
} from "@ftc-scout/common";
import { useMemo, useState, type ReactElement } from "react";
import { View } from "react-native";
import type { FullEvent } from "@/api/hooks";
import { Button } from "@/components/Button";
import { EmptyView } from "@/components/States";
import { Txt } from "@/components/Txt";
import type { MatchData } from "@/features/matches/model";
import { ColumnsPopup, useColumns } from "@/features/stats/ColumnsPopup";
import { nextSort, sortAndRank, type Sort } from "@/features/stats/localSort";
import { StatTable, TableViewToggle, type Lead } from "@/features/stats/StatTable";
import { openTeam } from "@/nav";
import { useTheme } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

// A tab's table: the columns are chosen in a popup and remembered per table (tableId).
function StatTab<T>({
    stats,
    tableId,
    defaults,
    defaultSort,
    exclude,
    data,
    lead,
    rowKey,
    empty,
}: {
    stats: StatSet<T>;
    tableId: string;
    defaults: string[];
    defaultSort: Sort;
    /** Stats the popup doesn't offer. */
    exclude: string[];
    data: T[];
    lead: Lead<T>;
    rowKey: (row: StatData<T>) => string;
    empty: ReactElement;
}) {
    let [columns, setColumns] = useColumns(tableId, defaults);
    let [sort, setSort] = useState(defaultSort);
    let [choosing, setChoosing] = useState(false);
    let rows = useMemo(
        () => sortAndRank(data, stats, sort, defaultSort),
        [data, stats, sort, defaultSort]
    );

    return (
        <>
            {!data.length ? (
                empty
            ) : (
                <>
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: space.sm,
                            paddingBottom: space.sm,
                        }}
                    >
                        <Button
                            label="Statistics"
                            icon="pen-to-square"
                            onPress={() => setChoosing(true)}
                        />
                        <View style={{ flex: 1 }} />
                        <TableViewToggle />
                    </View>
                    <StatTable
                        stats={stats}
                        columnIds={columns}
                        rows={rows}
                        sort={sort}
                        onSort={(id) => setSort(nextSort(sort, id, defaultSort))}
                        lead={lead}
                        rowKey={rowKey}
                        inline
                    />
                </>
            )}
            <ColumnsPopup
                visible={choosing}
                onClose={() => setChoosing(false)}
                stats={stats}
                shown={columns}
                exclude={exclude}
                onChange={setColumns}
                onReset={() => setColumns(null)}
            />
        </>
    );
}

export function TeamLead({
    number,
    name,
    stacked,
}: {
    number: number;
    name: string;
    stacked: boolean;
}) {
    if (stacked) {
        return (
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
                <Txt weight="semibold" tabular>
                    {number}
                </Txt>
                <Txt italic numberOfLines={1} style={{ flex: 1 }}>
                    {name}
                </Txt>
            </View>
        );
    }
    return (
        <>
            <Txt size="sm" tabular numberOfLines={1}>
                {number}
            </Txt>
            <Txt size="xs" italic numberOfLines={1}>
                {name}
            </Txt>
        </>
    );
}

type EventTeam = FullEvent["teams"][number];

// Rank and Team are the fixed lead columns, and "Event" is redundant within one event.
const RANKINGS_EXCLUDE = ["team", "eventRank", "event"];
const BY_RANK: Sort = { id: "eventRank", dir: SortDir.Asc };
const INSIGHTS_EXCLUDE = ["team1This", "team2This", "matchNum", "alliance", "event"];

export function RankingsTab({ event }: { event: FullEvent }) {
    let season = event.season as Season;
    let descriptor = DESCRIPTORS[season];
    let stats = getTepStatSet(season, event.remote);
    let totalPoints = descriptor.pensSubtract || event.remote ? "totalPoints" : "totalPointsNp";
    let defaults = useMemo(
        () => [
            "rankingScore",
            "tb1",
            "played",
            ...(event.remote ? [] : ["eventRecord"]),
            totalPoints + "Avg",
            ...(event.remote ? [] : [totalPoints + "Opr"]),
            totalPoints + "Max",
        ],
        [event.remote, totalPoints]
    );
    let teams = useMemo(() => event.teams.filter((t) => t.stats), [event.teams]);

    let lead: Lead<EventTeam> = useMemo(
        () => ({
            title: "Team",
            width: 170,
            sortId: "team",
            rankSortId: "eventRank",
            rank: (row) => row.data.stats?.rank,
            render: (row, stacked) => (
                <TeamLead
                    number={row.data.team.number}
                    name={row.data.team.name}
                    stacked={stacked}
                />
            ),
            onPress: (row) => openTeam(row.data.teamNumber, row.data.team.name, season),
            label: (row) => `Team ${row.data.team.number} ${row.data.team.name}`,
        }),
        [season]
    );

    return (
        <StatTab
            stats={stats}
            tableId={`eventTep${season}${event.remote ? "Remote" : "Trad"}`}
            defaults={defaults}
            defaultSort={BY_RANK}
            exclude={RANKINGS_EXCLUDE}
            data={teams}
            lead={lead}
            rowKey={(r) => String(r.data.teamNumber)}
            empty={
                <EmptyView
                    icon="trophy"
                    title="No rankings yet"
                    text="Rankings show once qualification matches have been played."
                />
            }
        />
    );
}

export function allianceScores(matches: MatchData[]): any[] {
    return matches.flatMap((m) => {
        if (!m.scores) return [];
        if ("red" in m.scores) {
            let r = {
                ...m.scores.red,
                match: m,
                teams: m.teams.filter((t) => t.alliance == "Red"),
            };
            let b = {
                ...m.scores.blue,
                match: m,
                teams: m.teams.filter((t) => t.alliance == "Blue"),
            };
            r.opponentsScore = b;
            b.opponentsScore = r;
            return [r, b];
        }
        return [{ ...m.scores, match: m, teams: m.teams }];
    });
}

export function AllianceLead({
    row,
    stacked,
    showEvent,
}: {
    row: StatData<any>;
    stacked: boolean;
    showEvent?: boolean;
}) {
    let c = useTheme();
    let d = row.data;
    let color = d.alliance == "Red" ? c.redText : d.alliance == "Blue" ? c.blueText : c.purpleText;
    let teams = d.teams.map((t: any) => t.teamNumber).join(" · ");
    let where =
        d.match.description + (showEvent && d.match.event ? ` · ${d.match.event.name}` : "");
    if (stacked) {
        return (
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
                <Txt weight="bold" tabular color={color}>
                    {teams}
                </Txt>
                <Txt size="sm" dim numberOfLines={1} style={{ flex: 1 }}>
                    {where}
                </Txt>
            </View>
        );
    }
    return (
        <>
            <Txt
                size={d.teams.length > 2 ? "xs" : "sm"}
                weight="bold"
                tabular
                color={color}
                numberOfLines={1}
            >
                {teams}
            </Txt>
            <Txt size="xs" numberOfLines={1}>
                {where}
            </Txt>
        </>
    );
}

export function InsightsTab({
    event,
    onOpenMatch,
}: {
    event: FullEvent;
    onOpenMatch: (m: MatchData) => void;
}) {
    let season = event.season as Season;
    let descriptor = DESCRIPTORS[season];
    let stats = getMatchStatSet(season, event.remote);
    // Remote matches have no opponent, so these stats would be empty.
    let insightsExclude = useMemo(
        () =>
            event.remote
                ? [
                      ...INSIGHTS_EXCLUDE,
                      ...stats.allStats.map((s) => s.id).filter((id) => id.endsWith("Opp")),
                  ]
                : INSIGHTS_EXCLUDE,
        [event.remote, stats]
    );
    let totalPoints =
        descriptor.pensSubtract || event.remote ? "totalPointsThis" : "totalPointsNpThis";
    let defaults = useMemo(
        () => [
            totalPoints,
            "autoPointsThis",
            "dcPointsThis",
            ...(descriptor.hasEndgame ? ["egPointsThis"] : []),
            ...descriptor.getMatchInsightCols(event.remote).map((col) => col + "This"),
        ],
        [descriptor, event.remote, totalPoints]
    );
    let defaultSort = useMemo(() => ({ id: totalPoints, dir: SortDir.Desc }), [totalPoints]);
    let data = useMemo(() => allianceScores(event.matches), [event.matches]);

    let threeTeams = data.some((d) => d.teams.length > 2);
    let lead: Lead<any> = useMemo(
        () => ({
            title: "Teams",
            width: 170,
            // Fits two five-digit team numbers, or three for old seasons.
            phoneWidth: threeTeams ? 150 : 124,
            render: (row, stacked) => <AllianceLead row={row} stacked={stacked} />,
            onPress: (row) => onOpenMatch(row.data.match),
            label: (row) => `Match ${row.data.match.description}, score breakdown`,
        }),
        [onOpenMatch, threeTeams]
    );

    return (
        <StatTab
            stats={stats}
            tableId={`eventMs${season}${event.remote ? "Remote" : "Trad"}`}
            defaults={defaults}
            defaultSort={defaultSort}
            exclude={insightsExclude}
            data={data}
            lead={lead}
            rowKey={(r) => `${r.data.match.id}-${r.data.alliance ?? r.data.teams[0]?.teamNumber}`}
            empty={
                <EmptyView
                    icon="lightbulb"
                    title="No scores yet"
                    text="Insights show once matches have been scored."
                />
            }
        />
    );
}
