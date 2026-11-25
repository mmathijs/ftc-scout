import { Platform, View } from "react-native";
import { goBack, goHome, openSearch, openSettings } from "@/nav";
import { setTheme } from "@/store/settings";
import { useTheme } from "@/theme/ThemeProvider";
import { space, TAP } from "@/theme/tokens";
import { IconButton } from "./Button";
import { Icon } from "./Icon";
import { Txt } from "./Txt";

export function Logo() {
    let c = useTheme();
    return (
        <View
            style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
            accessible
            accessibilityRole="header"
            accessibilityLabel="FTC Scout"
        >
            <Icon name="binoculars" size={22} color={c.onTheme} />
            <Txt size="xl" weight="bold" color={c.onTheme}>
                FTC
                <Txt size="xl" italic color={c.onTheme}>
                    Scout
                </Txt>
            </Txt>
        </View>
    );
}

export function HeaderMenu() {
    let c = useTheme();
    return (
        <View style={{ marginLeft: space.xs }}>
            <IconButton
                icon="bars"
                label="Menu and settings"
                onPress={openSettings}
                color={c.onTheme}
                size={22}
            />
        </View>
    );
}

export function HeaderBack({ canGoBack }: { canGoBack?: boolean }) {
    let c = useTheme();
    // The native header already insets its left side by 16; the web one doesn't.
    let marginLeft = Platform.OS == "web" ? space.xs : space.xs - 16;
    return (
        <View style={{ marginLeft, marginRight: space.xs }}>
            {canGoBack ? (
                <IconButton icon="arrow-left" label="Back" onPress={goBack} color={c.onTheme} />
            ) : (
                <IconButton icon="house" label="Home" onPress={goHome} color={c.onTheme} />
            )}
        </View>
    );
}

export function HeaderActions() {
    let c = useTheme();
    let dark = c.scheme == "dark";
    return (
        <View style={{ flexDirection: "row", marginRight: space.xs }}>
            <IconButton
                icon="magnifying-glass"
                label="Search for teams and events"
                onPress={openSearch}
                color={c.onTheme}
            />
            <IconButton
                icon={dark ? "sun" : "moon"}
                label={dark ? "Switch to the light theme" : "Switch to the dark theme"}
                onPress={() => setTheme(dark ? "light" : "dark")}
                color={c.onTheme}
                size={22}
            />
        </View>
    );
}

export function HeaderStar({
    active,
    onPress,
    label,
}: {
    active: boolean;
    onPress?: () => void;
    label?: string;
}) {
    let c = useTheme();
    if (!onPress) {
        return (
            <View
                accessible
                accessibilityRole="button"
                accessibilityLabel={label ?? "Favorite"}
                accessibilityState={{ disabled: true }}
                style={{
                    width: TAP,
                    height: TAP,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: 0.5,
                }}
            >
                <Icon name="star" size={20} solid={active} color={c.onTheme} />
            </View>
        );
    }
    return (
        <IconButton
            icon="star"
            solid={active}
            color={c.onTheme}
            label={label ?? "Favorite"}
            onPress={onPress}
        />
    );
}

export function PageHeaderRight({
    deep,
    ...star
}: {
    deep: boolean;
    active: boolean;
    onPress?: () => void;
    label?: string;
}) {
    let c = useTheme();
    return (
        <View style={{ flexDirection: "row" }}>
            {deep ? (
                <IconButton
                    icon="house"
                    label="Back to the start"
                    onPress={goHome}
                    color={c.onTheme}
                />
            ) : null}
            <HeaderStar {...star} />
        </View>
    );
}
