import type { StatSet } from "@ftc-scout/common";
import { FlashList } from "@shopify/flash-list";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Popup, usePopupRoom } from "@/components/Popup";
import { Press } from "@/components/Pressable";
import { SearchField } from "@/components/SearchField";
import { Txt } from "@/components/Txt";
import { createStore } from "@/store/createStore";
import { loadColumns } from "./columns";
import { useTheme } from "@/theme/ThemeProvider";
import { space, TAP, type StatColor } from "@/theme/tokens";

const stores = new Map<string, ReturnType<typeof createStore<string[] | null>>>();

// Remembered per table and season, since each season has its own stats.
export function useColumns(
    tableId: string,
    defaults: string[]
): [string[], (ids: string[] | null) => void] {
    let store = stores.get(tableId);
    if (!store)
        stores.set(
            tableId,
            (store = createStore<string[] | null>(`cols:${tableId}`, null, { load: loadColumns }))
        );
    let chosen = store.useValue();
    return [chosen ?? defaults, store.set];
}

export function ColumnsPopup<T>({
    visible,
    onClose,
    stats,
    shown,
    exclude,
    onChange,
    onReset,
}: {
    visible: boolean;
    onClose: () => void;
    stats: StatSet<T>;
    shown: string[];
    /** Stats the table already shows as its lead columns. */
    exclude: string[];
    onChange: (ids: string[]) => void;
    onReset: () => void;
}) {
    let c = useTheme();
    let room = usePopupRoom(TAP + space.md);
    let [filter, setFilter] = useState("");
    let all = useMemo(
        () => stats.allStats.filter((s) => !exclude.includes(s.id)),
        [stats, exclude]
    );
    let list = useMemo(() => {
        let f = filter.trim().toLowerCase();
        return f
            ? all.filter(
                  (s) =>
                      s.titleName.toLowerCase().includes(f) ||
                      s.columnName.toLowerCase().includes(f)
              )
            : all;
    }, [all, filter]);

    let close = () => {
        setFilter("");
        onClose();
    };

    function toggle(id: string) {
        onChange(shown.includes(id) ? shown.filter((s) => s != id) : [...shown, id]);
    }

    return (
        <Popup visible={visible} onClose={close} title="Statistics" scroll={false}>
            <View
                style={{
                    flexDirection: "row",
                    gap: space.sm,
                    paddingHorizontal: space.md,
                    paddingBottom: space.sm,
                    alignItems: "center",
                }}
            >
                <View style={{ flex: 1 }}>
                    <SearchField
                        value={filter}
                        onChangeText={setFilter}
                        placeholder="Search"
                        accessibilityLabel="Find a statistic"
                    />
                </View>
                <Button label="Reset" icon="rotate-left" onPress={onReset} />
            </View>
            <View style={{ height: Math.min(400, room) }}>
                <FlashList
                    data={list}
                    keyExtractor={(s) => s.id}
                    extraData={shown}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={
                        <Txt dim center style={{ padding: space.lg }}>
                            No statistic is called that.
                        </Txt>
                    }
                    renderItem={({ item }) => {
                        let on = shown.includes(item.id);
                        let fill =
                            item.color == "white"
                                ? c.textMuted
                                : c.stat[item.color as StatColor].fill;
                        return (
                            <Press
                                onPress={() => toggle(item.id)}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: on }}
                                style={{
                                    minHeight: TAP,
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: space.md,
                                    paddingHorizontal: space.md,
                                }}
                            >
                                <Icon
                                    name={on ? "square-check" : "square"}
                                    solid={on}
                                    size={18}
                                    color={on ? c.accent : c.textMuted}
                                />
                                <Txt style={{ flex: 1 }} numberOfLines={2}>
                                    {item.titleName}
                                </Txt>
                                <View
                                    style={{
                                        backgroundColor: fill,
                                        borderRadius: 4,
                                        paddingHorizontal: 6,
                                        paddingVertical: 2,
                                    }}
                                >
                                    <Txt size="xs" weight="bold" color="#ffffff">
                                        {item.columnName}
                                    </Txt>
                                </View>
                            </Press>
                        );
                    }}
                />
            </View>
        </Popup>
    );
}
