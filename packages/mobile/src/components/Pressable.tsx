import {
    Pressable as RNPressable,
    type PressableProps,
    type StyleProp,
    type ViewStyle,
} from "react-native";
import { useTheme } from "@/theme/ThemeProvider";

export function Press({
    style,
    children,
    ...rest
}: Omit<PressableProps, "style"> & { style?: StyleProp<ViewStyle> }) {
    let c = useTheme();
    return (
        <RNPressable
            android_ripple={{ color: c.sep }}
            {...rest}
            style={({ pressed }) => [style, pressed ? { opacity: 0.6 } : null]}
        >
            {children}
        </RNPressable>
    );
}
