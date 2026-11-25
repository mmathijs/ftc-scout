import { FlashList } from "@shopify/flash-list";
import { useState } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space, TAP } from "@/theme/tokens";
import { Icon } from "./Icon";
import { Popup, usePopupRoom } from "./Popup";
import { Press } from "./Pressable";
import { Txt } from "./Txt";

export type Option<T> = { value: T; label: string };

export function Select<T extends string | number>({
    title,
    value,
    groups,
    onChange,
    showLabel = true,
    plain,
    style,
}: {
    title: string;
    value: T;
    groups: Option<T>[][];
    onChange: (value: T) => void;
    showLabel?: boolean;
    /** Uses the card's colour rather than the form gray. */
    plain?: boolean;
    style?: StyleProp<ViewStyle>;
}) {
    let c = useTheme();
    let [open, setOpen] = useState(false);
    let room = usePopupRoom();
    let flat = groups.flatMap((g, gi) => g.map((o, i) => ({ ...o, first: i == 0 && gi > 0 })));
    let current = flat.find((o) => o.value == value);

    return (
        <View style={style}>
            {showLabel ? <Txt style={{ marginBottom: space.xs }}>{title}</Txt> : null}
            <Press
                onPress={() => setOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`${title}: ${current?.label ?? ""}`}
                style={{
                    minHeight: TAP - 4,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space.sm,
                    paddingHorizontal: space.sm,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: c.sep,
                    backgroundColor: plain ? c.surface : c.form,
                }}
            >
                <Txt style={{ flex: 1 }} numberOfLines={1}>
                    {current?.label ?? ""}
                </Txt>
                <Icon name="chevron-down" size={12} color={c.textSecondary} />
            </Press>
            <Popup visible={open} onClose={() => setOpen(false)} title={title} scroll={false}>
                <View style={{ height: Math.min(flat.length * TAP + space.sm, 440, room) }}>
                    <FlashList
                        data={flat}
                        keyExtractor={(o) => String(o.value)}
                        initialScrollIndex={Math.max(
                            0,
                            flat.findIndex((o) => o.value == value) - 3
                        )}
                        renderItem={({ item }) => {
                            let selected = item.value == value;
                            return (
                                <Press
                                    onPress={() => {
                                        onChange(item.value);
                                        setOpen(false);
                                    }}
                                    accessibilityRole="radio"
                                    accessibilityState={{ checked: selected }}
                                    style={{
                                        minHeight: TAP,
                                        flexDirection: "row",
                                        alignItems: "center",
                                        paddingHorizontal: space.md,
                                        gap: space.md,
                                        borderTopWidth: item.first ? 1 : 0,
                                        borderTopColor: c.sep,
                                        backgroundColor: selected ? c.raised : "transparent",
                                    }}
                                >
                                    <View style={{ width: 16 }}>
                                        {selected ? <Icon name="check" size={14} /> : null}
                                    </View>
                                    <Txt
                                        weight={selected ? "semibold" : "regular"}
                                        style={{ flex: 1 }}
                                    >
                                        {item.label}
                                    </Txt>
                                </Press>
                            );
                        }}
                    />
                </View>
            </Popup>
        </View>
    );
}
