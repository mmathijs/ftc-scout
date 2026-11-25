import { View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, type Palette } from "@/theme/tokens";
import { Txt } from "./Txt";

type Kind = "type" | "remote" | "region";

// The website's colours for an event's type and region, except that the light theme's are darker:
// white small text on its #2196f3 and #f44336 is under the 4.5:1 that WCAG AA asks for.
export const BADGE_COLORS: Record<Palette["scheme"], Record<Kind, string>> = {
    light: { type: "#1976d2", remote: "#aa00ff", region: "#d32f2f" },
    dark: { type: "#1976d2", remote: "#7f00be", region: "#cc2f2f" },
};

export function Badge({ label, kind }: { label: string; kind: Kind }) {
    let c = useTheme();
    return (
        <View
            style={{
                backgroundColor: BADGE_COLORS[c.scheme][kind],
                borderRadius: radius.sm,
                minWidth: 34,
                paddingHorizontal: 5,
                paddingVertical: 2,
                alignItems: "center",
            }}
        >
            <Txt size="sm" weight="semibold" color="#ffffff">
                {label}
            </Txt>
        </View>
    );
}
