import { Tabs } from "expo-router/js-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HeaderActions, HeaderMenu, Logo } from "@/components/Header";
import { Icon, type IconName } from "@/components/Icon";
import { useTheme } from "@/theme/ThemeProvider";
import { families, font } from "@/theme/tokens";

const TABS: { name: string; title: string; icon: IconName }[] = [
    { name: "index", title: "Home", icon: "house" },
    { name: "favorites", title: "Favorites", icon: "star" },
];

export default function TabsLayout() {
    let c = useTheme();
    let insets = useSafeAreaInsets();
    return (
        <Tabs
            screenOptions={{
                headerStyle: { backgroundColor: c.theme },
                headerTintColor: c.onTheme,
                headerTitleStyle: { fontFamily: families.semibold, fontSize: font.lg },
                headerTitleAlign: "left",
                headerLeft: () => <HeaderMenu />,
                headerRight: () => <HeaderActions />,
                headerShadowVisible: false,
                tabBarActiveTintColor: c.accent,
                tabBarInactiveTintColor: c.textSecondary,
                tabBarStyle: {
                    backgroundColor: c.surface,
                    borderTopColor: c.sep,
                    height: 60 + insets.bottom,
                    paddingTop: 6,
                },
                tabBarLabelStyle: { fontFamily: families.semibold, fontSize: font.xs },
                sceneStyle: { backgroundColor: c.bg },
            }}
        >
            {TABS.map((t) => (
                <Tabs.Screen
                    key={t.name}
                    name={t.name}
                    options={{
                        title: t.title,
                        headerTitle: () => <Logo />,
                        tabBarIcon: ({ color, size }) => (
                            <Icon name={t.icon} size={size - 4} color={color as string} />
                        ),
                    }}
                />
            ))}
        </Tabs>
    );
}
