import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_400Regular_Italic } from "@expo-google-fonts/inter/400Regular_Italic";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { useNavigationContainerRef, type ErrorBoundaryProps } from "expo-router";
import { Stack } from "expo-router/stack";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { prefetchTabs, pruneSaved } from "@/api/hooks";
import { seasonParam, teamNumberParam } from "@/api/params";
import { queryClient, wireQueryClient } from "@/api/queryClient";
import { HeaderBack, PageHeaderRight } from "@/components/Header";
import { ScreenError } from "@/components/States";
import { LaunchOverlay } from "@/features/launch/LaunchOverlay";
import { isDeep, setNavigation, teamTitle } from "@/nav";
import { settings } from "@/store/settings";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { families, font } from "@/theme/tokens";
import { wireUpdates } from "@/updates";

SplashScreen.preventAutoHideAsync().catch(() => {});
wireQueryClient();
wireUpdates();

// A page opened from a link (ftcscout://team/3954) gets the tabs under it to go back to.
export const unstable_settings = { anchor: "(tabs)" };

export function ErrorBoundary(props: ErrorBoundaryProps) {
    return (
        <ThemeProvider>
            <View style={{ flex: 1, justifyContent: "center" }}>
                <ScreenError {...props} />
            </View>
        </ThemeProvider>
    );
}

function Screens() {
    let c = useTheme();
    setNavigation(useNavigationContainerRef());
    return (
        <>
            <StatusBar style="light" />
            <Stack
                unstable_screenErrorBoundary={ScreenError}
                screenOptions={{
                    headerStyle: { backgroundColor: c.theme },
                    headerTintColor: c.onTheme,
                    headerTitleStyle: { fontFamily: families.semibold, fontSize: font.lg },
                    // The navigator's back button is too small and reads the last title as its label.
                    headerBackVisible: false,
                    headerLeft: ({ canGoBack }) => <HeaderBack canGoBack={canGoBack} />,
                    contentStyle: { backgroundColor: c.bg },
                }}
            >
                <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "Home" }} />
                <Stack.Screen
                    name="search"
                    options={{ title: "Search", animation: "fade_from_bottom" }}
                />
                <Stack.Screen name="settings" options={{ title: "Menu" }} />
                <Stack.Screen name="+not-found" options={{ title: "Not found" }} />
                <Stack.Screen
                    name="team/[number]"
                    options={({ route }) => {
                        let p = (route.params ?? {}) as {
                            number?: string;
                            name?: string;
                            d?: string;
                        };
                        if (teamNumberParam(p.number) == null) return { title: "Team" };
                        return {
                            title: teamTitle(p.number ?? "", p.name),
                            headerRight: () => (
                                <PageHeaderRight deep={isDeep(p.d)} active={false} />
                            ),
                        };
                    }}
                />
                <Stack.Screen
                    name="event/[season]/[code]"
                    options={({ route }) => {
                        let p = (route.params ?? {}) as {
                            season?: string;
                            name?: string;
                            d?: string;
                        };
                        if (seasonParam(p.season) == null) return { title: "Event" };
                        return {
                            title: p.name ?? "Event",
                            headerRight: () => (
                                <PageHeaderRight deep={isDeep(p.d)} active={false} />
                            ),
                        };
                    }}
                />
            </Stack>
        </>
    );
}

export default function RootLayout() {
    let [loaded, error] = useFonts({
        Inter_400Regular,
        Inter_400Regular_Italic,
        Inter_600SemiBold,
        Inter_700Bold,
    });

    useEffect(() => {
        let warm = setTimeout(() => prefetchTabs(queryClient, settings.get().season), 1500);
        let prune = setTimeout(pruneSaved, 5000);
        return () => {
            clearTimeout(warm);
            clearTimeout(prune);
        };
    }, []);

    // The splash screen stays until the fonts load (or fail), then LaunchOverlay hides it.
    if (!loaded && !error) return null;

    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                <View style={{ flex: 1 }}>
                    <Screens />
                    <LaunchOverlay />
                </View>
            </ThemeProvider>
        </QueryClientProvider>
    );
}
