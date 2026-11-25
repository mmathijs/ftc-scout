import { ScrollView, useWindowDimensions, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { font, MAX_FONT_SCALE, radius, space, TAP } from "@/theme/tokens";
import { CARD_MARGIN } from "./Card";
import { Icon, type IconName } from "./Icon";
import { Press } from "./Pressable";
import { Txt } from "./Txt";

export type Tab<T extends string> = { id: T; label: string; icon: IconName };

const ICON = 15;
const PAD = space.md;
const GAP = space.xs;
/** Width of a letter as a fraction of the font size (Inter semibold, roughly). */
const LETTER = 0.58;

function tabWidth(label: string | null, scale: number): number {
    let text = label ? space.sm + label.length * font.lg * LETTER * scale : 0;
    return 2 * PAD + ICON + text + 2;
}

// When the names don't fit, only the selected tab keeps its name, like the website on a phone.
export function tabsFit(labels: string[], width: number, scale = 1): boolean {
    let all = labels.reduce((sum, l) => sum + tabWidth(l, scale), 0) + (labels.length - 1) * GAP;
    return all <= width - 2 * CARD_MARGIN;
}

export function FolderTabs<T extends string>({
    tabs,
    value,
    onChange,
}: {
    tabs: Tab<T>[];
    value: T;
    onChange: (id: T) => void;
}) {
    let c = useTheme();
    let { width, fontScale } = useWindowDimensions();
    let scale = Math.min(fontScale, MAX_FONT_SCALE);
    let named = tabsFit(
        tabs.map((t) => t.label),
        width,
        scale
    );
    return (
        <View style={{ marginTop: space.md, marginBottom: -1, zIndex: 1 }}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: CARD_MARGIN, gap: GAP }}
                accessibilityRole="tablist"
            >
                {tabs.map((tab) => {
                    let selected = tab.id == value;
                    return (
                        <Press
                            key={tab.id}
                            onPress={() => onChange(tab.id)}
                            accessibilityRole="tab"
                            accessibilityState={{ selected }}
                            accessibilityLabel={tab.label}
                            style={{
                                minHeight: TAP,
                                minWidth: TAP,
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: space.sm,
                                paddingHorizontal: PAD,
                                borderTopLeftRadius: radius.md,
                                borderTopRightRadius: radius.md,
                                borderWidth: 1,
                                borderBottomWidth: 0,
                                borderColor: selected ? c.sep : "transparent",
                                backgroundColor: selected ? c.surface : "transparent",
                            }}
                        >
                            <Icon name={tab.icon} size={ICON} color={c.text} />
                            {named || selected ? (
                                <Txt size="lg" weight="semibold" numberOfLines={1}>
                                    {tab.label}
                                </Txt>
                            ) : null}
                        </Press>
                    );
                })}
            </ScrollView>
        </View>
    );
}
