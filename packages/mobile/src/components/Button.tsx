import { View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space, TAP } from "@/theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Press } from "./Pressable";
import { Txt } from "./Txt";

export function Button({
    label,
    icon,
    onPress,
    primary,
    disabled,
    accessibilityLabel,
}: {
    label: string;
    icon?: IconName;
    onPress: () => void;
    primary?: boolean;
    disabled?: boolean;
    accessibilityLabel?: string;
}) {
    let c = useTheme();
    let fg = primary ? c.onTheme : c.text;
    return (
        <Press
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityState={{ disabled: !!disabled }}
            style={{
                minHeight: TAP - 4,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: space.sm,
                paddingHorizontal: space.lg,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: primary ? c.theme : c.sep,
                backgroundColor: primary ? c.theme : c.form,
                opacity: disabled ? 0.6 : 1,
            }}
        >
            {icon ? <Icon name={icon} size={14} color={fg} /> : null}
            <Txt
                color={fg}
                weight={primary ? "bold" : "regular"}
                numberOfLines={1}
                style={{ flexShrink: 1 }}
            >
                {label}
            </Txt>
        </Press>
    );
}

export function IconButton({
    icon,
    onPress,
    label,
    color,
    size = 20,
    solid,
}: {
    icon: IconName;
    onPress: () => void;
    label: string;
    color?: string;
    size?: number;
    solid?: boolean;
}) {
    return (
        <Press
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            hitSlop={4}
            style={{
                width: TAP,
                height: TAP,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: radius.pill,
            }}
        >
            <View>
                <Icon name={icon} size={size} color={color} solid={solid} />
            </View>
        </Press>
    );
}
