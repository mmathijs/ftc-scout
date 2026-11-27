import type { ExpoConfig } from "expo/config";

const THEME = "#2c666e";
const THEME_DARK = "#1f4c52";

// OTA lives on `ota.mmathijs.nl` with cloudflare R2: `ota-cdn.mmathijs.nl`
const OTA_APP_ID = "2d7b42eb-bd3c-4fbf-a945-5a3c9a2604d8";

const config: ExpoConfig = {
    name: "FTCScout",
    slug: "ftcscout",
    version: "1.0.0",
    // Update on packages update
    runtimeVersion: "1",
    updates: {
        enabled: true,
        url: "https://ota.mmathijs.nl/manifest",
        codeSigningCertificate: process.env.DISABLE_CODE_SIGNING
            ? undefined
            : "./certs/certificate.pem",
        codeSigningMetadata: process.env.DISABLE_CODE_SIGNING
            ? undefined
            : { keyid: "main", alg: "rsa-v1_5-sha256" },
        requestHeaders: {
            "expo-channel-name": process.env.RELEASE_CHANNEL ?? "production",
            "expo-app-id": OTA_APP_ID,
            "xprem-branch": "",
        },
    },
    orientation: "default",
    icon: "./assets/images/icon.png",
    scheme: "ftcscout",
    userInterfaceStyle: "automatic",
    ios: {
        bundleIdentifier: "nl.mmathijs.ftcscout.beta",
        supportsTablet: true,
    },
    android: {
        package: "nl.mmathijs.ftcscout.beta",
        versionCode: process.env.ANDROID_VERSION_CODE
            ? Number(process.env.ANDROID_VERSION_CODE)
            : undefined,
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
        "./plugins/with-release-signing",
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
