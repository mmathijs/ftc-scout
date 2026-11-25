import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";
import { Txt } from "./Txt";

export const CARD_MARGIN = space.sm;
export const CARD_PAD = space.md;

export function Card({
    children,
    style,
    flush,
}: {
    children: ReactNode;
    style?: StyleProp<ViewStyle>;
    flush?: boolean;
}) {
    let c = useTheme();
    return (
        <View
            style={[
                {
                    backgroundColor: c.surface,
                    borderColor: c.sep,
                    borderWidth: 1,
                    borderRadius: radius.md,
                    marginHorizontal: CARD_MARGIN,
                    marginTop: space.md,
                    padding: flush ? 0 : CARD_PAD,
                },
                style,
            ]}
        >
            {children}
        </View>
    );
}

export function CardHeading({ title, right }: { title: string; right?: ReactNode }) {
    let c = useTheme();
    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: space.md,
                paddingBottom: space.sm,
                marginBottom: space.sm,
                borderBottomWidth: 1,
                borderBottomColor: c.textMuted,
            }}
        >
            <Txt size="xl" weight="semibold" accessibilityRole="header" style={{ flexShrink: 1 }}>
                {title}
            </Txt>
            {right}
        </View>
    );
}

export function Title({ children }: { children: ReactNode }) {
    return (
        <Txt size="xxl" weight="bold" accessibilityRole="header" style={{ marginBottom: space.sm }}>
            {children}
        </Txt>
    );
}

export function CardRow({
    children,
    pad = CARD_PAD,
    style,
}: {
    children: ReactNode;
    pad?: number;
    style?: StyleProp<ViewStyle>;
}) {
    let c = useTheme();
    return (
        <View
            style={[
                {
                    marginHorizontal: CARD_MARGIN,
                    paddingHorizontal: pad,
                    backgroundColor: c.surface,
                    borderLeftWidth: 1,
                    borderRightWidth: 1,
                    borderColor: c.sep,
                },
                style,
            ]}
        >
            {children}
        </View>
    );
}

/** `flatLeft` squares the corner under a selected first tab. */
export function CardTop({ flatLeft, gap = true }: { flatLeft?: boolean; gap?: boolean }) {
    let c = useTheme();
    return (
        <View
            style={{
                height: CARD_PAD,
                marginHorizontal: CARD_MARGIN,
                marginTop: gap ? space.md : 0,
                backgroundColor: c.surface,
                borderWidth: 1,
                borderBottomWidth: 0,
                borderColor: c.sep,
                borderTopLeftRadius: flatLeft ? 0 : radius.md,
                borderTopRightRadius: radius.md,
            }}
        />
    );
}

export function CardBottom() {
    let c = useTheme();
    return (
        <View
            style={{
                height: CARD_PAD,
                marginHorizontal: CARD_MARGIN,
                backgroundColor: c.surface,
                borderWidth: 1,
                borderTopWidth: 0,
                borderColor: c.sep,
                borderBottomLeftRadius: radius.md,
                borderBottomRightRadius: radius.md,
            }}
        />
    );
}
