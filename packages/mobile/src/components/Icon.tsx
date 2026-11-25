import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import type { ComponentProps } from "react";
import { useTheme } from "@/theme/ThemeProvider";

export type IconName = ComponentProps<typeof FontAwesome6>["name"];

export function Icon({
    name,
    size = 16,
    color,
    solid = true,
}: {
    name: IconName;
    size?: number;
    color?: string;
    solid?: boolean;
}) {
    let c = useTheme();
    // Hidden from screen readers: a glyph reads as "#" or nothing, and the text beside it names it.
    return (
        <FontAwesome6
            name={name}
            size={size}
            color={color ?? c.accent}
            solid={solid}
            accessible={false}
            aria-hidden
            importantForAccessibility="no"
        />
    );
}
