import { Text, type TextProps, type TextStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { families, font, MAX_FONT_SCALE, type FontSize } from "@/theme/tokens";

export type TxtProps = TextProps & {
    size?: FontSize;
    weight?: "regular" | "semibold" | "bold";
    italic?: boolean;
    color?: string;
    dim?: boolean;
    center?: boolean;
    tabular?: boolean;
};

export function Txt({
    size = "md",
    weight = "regular",
    italic,
    color,
    dim,
    center,
    tabular,
    style,
    ...rest
}: TxtProps) {
    let c = useTheme();
    let base: TextStyle = {
        // Only one italic file is loaded, so italic text is regular weight.
        fontFamily: italic ? families.italic : families[weight],
        fontSize: font[size],
        color: color ?? (dim ? c.textSecondary : c.text),
        ...(center ? { textAlign: "center" } : null),
        ...(tabular ? { fontVariant: ["tabular-nums"] } : null),
    };
    return <Text maxFontSizeMultiplier={MAX_FONT_SCALE} {...rest} style={[base, style]} />;
}
