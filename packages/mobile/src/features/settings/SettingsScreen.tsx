import { useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { router, type Href } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { cacheEntryCount, clearCache } from "@/api/cache";
import { API_ORIGIN, SITE_ORIGIN } from "@/api/config";
import { Button } from "@/components/Button";
import { Card, CardHeading } from "@/components/Card";
import { Icon, type IconName } from "@/components/Icon";
import { Press } from "@/components/Pressable";
import { Page } from "@/components/Screen";
import { Select } from "@/components/Select";
import { Txt } from "@/components/Txt";
import { SEASON_OPTIONS } from "@/features/options";
import { prettyPrintURL } from "@/format";
import { setSeason, setTheme, settings, type ThemePreference } from "@/store/settings";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space, TAP } from "@/theme/tokens";

function site(path: string) {
    WebBrowser.openBrowserAsync(SITE_ORIGIN + path).catch(() => {});
}

function NavItem({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
    let c = useTheme();
    return (
        <Press
            onPress={onPress}
            accessibilityRole="link"
            accessibilityLabel={label}
            style={{
                minHeight: TAP,
                flexDirection: "row",
                alignItems: "center",
                gap: space.md,
                paddingHorizontal: space.md,
                borderRadius: radius.md,
            }}
        >
            <View style={{ width: 24, alignItems: "center" }}>
                <Icon name={icon} size={18} color={c.textSecondary} />
            </View>
            <Txt color={c.textSecondary} style={{ flex: 1 }}>
                {label}
            </Txt>
        </Press>
    );
}

export function SettingsScreen() {
    let c = useTheme();
    let s = settings.useValue();
    let client = useQueryClient();
    let [saved, setSaved] = useState(cacheEntryCount);
    let go = (path: string) => {
        router.back();
        router.navigate(path as Href);
    };

    return (
        <Page>
            <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
                <Card style={{ padding: space.sm }}>
                    <NavItem icon="house" label="Home" onPress={() => go("/")} />
                    <NavItem icon="calendar-days" label="Events" onPress={() => go("/events")} />
                    <NavItem icon="star" label="Favorites" onPress={() => go("/favorites")} />
                    <View style={{ height: 1, backgroundColor: c.sep, marginVertical: space.sm }} />
                    <NavItem
                        icon="binoculars"
                        label="The Scouting Report"
                        onPress={() => site("/blog")}
                    />
                    <View style={{ height: 1, backgroundColor: c.sep, marginVertical: space.sm }} />
                    <NavItem icon="circle-info" label="About" onPress={() => site("/about")} />
                    <NavItem icon="gavel" label="Privacy Policy" onPress={() => site("/privacy")} />
                    <NavItem icon="code" label="API" onPress={() => site("/api")} />
                </Card>

                <Card>
                    <CardHeading title="Appearance" />
                    <Select<ThemePreference>
                        title="Theme"
                        value={s.theme}
                        onChange={setTheme}
                        groups={[
                            [
                                { value: "system", label: "Same as the phone" },
                                { value: "light", label: "Light" },
                                { value: "dark", label: "Dark" },
                            ],
                        ]}
                    />
                    <View style={{ height: space.md }} />
                    <Select
                        title="Season that pages open on"
                        value={s.season}
                        groups={SEASON_OPTIONS}
                        onChange={setSeason}
                    />
                </Card>

                <Card>
                    <CardHeading title="Offline copies" />
                    <Txt style={{ marginBottom: space.md }}>
                        Pages you open are kept on this phone for 30 days, so they open at once and
                        without a connection. {saved} saved.
                    </Txt>
                    <View style={{ flexDirection: "row" }}>
                        <Button
                            label="Clear saved pages"
                            icon="trash"
                            disabled={saved == 0}
                            onPress={() => {
                                clearCache();
                                client.clear();
                                setSaved(0);
                            }}
                        />
                    </View>
                </Card>

                <Txt
                    size="sm"
                    dim
                    center
                    style={{ marginTop: space.lg, paddingHorizontal: space.lg }}
                >
                    {Constants.expoConfig?.name ?? "FTCScout"}{" "}
                    {Constants.expoConfig?.version ?? "1.0.0"} · Data from{" "}
                    <Txt size="sm" italic dim>
                        FIRST
                    </Txt>{" "}
                    via {prettyPrintURL(API_ORIGIN)}
                </Txt>
            </ScrollView>
        </Page>
    );
}
