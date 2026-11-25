import type { ExpoConfig } from "expo/config";

const THEME = "#2c666e";
const THEME_DARK = "#1f4c52";

const config: ExpoConfig = {
    name: "FTCScout",
    slug: "ftcscout",
    version: "1.0.0",
    orientation: "default",
    icon: "./assets/images/icon.png",
    scheme: "ftcscout",
    userInterfaceStyle: "automatic",
    ios: {
        bundleIdentifier: "nl.mmathijs.ftcscout",
        supportsTablet: true,
    },
    android: {
        package: "nl.mmathijs.ftcscout",
        adaptiveIcon: {
            backgroundColor: THEME,
            foregroundImage: "./assets/images/android-icon-foreground.png",
            monochromeImage: "./assets/images/android-icon-monochrome.png",
        },
    },
    web: {
        output: "single",
        favicon: "./assets/images/favicon.png",
    },
    plugins: [
        "expo-router",
        "expo-sqlite",
        "expo-font",
        [
            "expo-splash-screen",
            {
                backgroundColor: THEME,
                image: "./assets/images/splash-icon.png",
                imageWidth: 96,
                // src/features/launch starts as a copy of this screen, so they must match.
                dark: {
                    backgroundColor: THEME_DARK,
                    image: "./assets/images/splash-icon.png",
                },
            },
        ],
    ],
    experiments: {
        typedRoutes: true,
        reactCompiler: true,
    },
};

export default config;
