import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import {
    AccessibilityInfo,
    Animated,
    Easing,
    Image,
    Platform,
    useColorScheme,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dark, families, light, MAX_FONT_SCALE } from "@/theme/tokens";
import { BAR_SCALE, launchPath, LOGO_GAP, LOGO_ICON, LOGO_TEXT } from "./path";

// Starts as a copy of the native splash so the swap is invisible, then lifts into the teal top bar.
// Only transforms and opacity animate, so it runs off the JS thread while the app loads below.
const LOOK_MS = 240;
const FORM_MS = 340;
const HOLD_MS = 200;
const LIFT_MS = 400;
/** With Reduce Motion on nothing moves: the logo shows, then the sheet fades. */
const STILL_MS = 450;
const FADE_MS = 220;
/** "FTCScout" in Inter is about this many times as wide as it is tall. */
const TEXT_WIDTH_GUESS = 4.45;
const GIVE_UP_MS = 4000;

const BAR_HEIGHT = Platform.select({ ios: 44, android: 56, default: 64 });

const BINOCULARS = require("../../../assets/images/splash-icon.png");

export function LaunchOverlay() {
    let { width, height } = useWindowDimensions();
    let insets = useSafeAreaInsets();
    // The native splash follows the system theme, not the app's setting.
    let teal = (useColorScheme() == "dark" ? dark : light).theme;

    let [textWidth, setTextWidth] = useState<number | null>(null);
    let [lifting, setLifting] = useState(false);
    let [done, setDone] = useState(false);
    let measured = textWidth != null;

    let look = useRef(new Animated.Value(0)).current;
    let form = useRef(new Animated.Value(0)).current;
    let lift = useRef(new Animated.Value(0)).current;
    let fade = useRef(new Animated.Value(1)).current;

    // Starts once the logo is measured. A later measure doesn't restart it.
    useEffect(() => {
        if (!measured) return;
        let cancelled = false;

        (async () => {
            let still = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
            if (cancelled) return;

            if (still) form.setValue(1);

            // Our first frame matches the native splash, so hide it instantly.
            SplashScreen.setOptions({ fade: false, duration: 0 });
            SplashScreen.hideAsync().catch(() => {});

            let native = { useNativeDriver: true } as const;
            if (still) {
                Animated.sequence([
                    Animated.delay(STILL_MS),
                    Animated.timing(fade, { toValue: 0, duration: FADE_MS, ...native }),
                ]).start(() => setDone(true));
                setTimeout(() => setLifting(true), STILL_MS);
                return;
            }
            Animated.sequence([
                Animated.timing(look, {
                    toValue: 1,
                    duration: LOOK_MS,
                    easing: Easing.inOut(Easing.quad),
                    ...native,
                }),
                Animated.timing(form, {
                    toValue: 1,
                    duration: FORM_MS,
                    easing: Easing.out(Easing.cubic),
                    ...native,
                }),
                Animated.delay(HOLD_MS),
                Animated.timing(lift, {
                    toValue: 1,
                    duration: LIFT_MS,
                    easing: Easing.inOut(Easing.cubic),
                    ...native,
                }),
            ]).start(() => setDone(true));
            // Let taps through to the page as soon as the sheet starts lifting.
            setTimeout(() => setLifting(true), LOOK_MS + FORM_MS + HOLD_MS);
        })();

        return () => {
            cancelled = true;
        };
    }, [measured, look, form, lift, fade]);

    // Never leave the app stuck behind the splash if the animation fails.
    useEffect(() => {
        let t = setTimeout(() => {
            SplashScreen.hideAsync().catch(() => {});
            setDone(true);
        }, GIVE_UP_MS);
        return () => clearTimeout(t);
    }, []);

    if (done) return null;

    let path = launchPath({
        width,
        height,
        textWidth: textWidth ?? LOGO_TEXT * TEXT_WIDTH_GUESS,
        barCenterY: insets.top + BAR_HEIGHT / 2,
    });
    let between = (v: Animated.Value, from: number, to: number) =>
        v.interpolate({ inputRange: [0, 1], outputRange: [from, to] });

    return (
        <Animated.View
            testID="launch-overlay"
            pointerEvents={lifting ? "none" : "auto"}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 100,
                elevation: 100,
                opacity: fade,
            }}
        >
            <Animated.View
                style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: teal,
                    transform: [{ translateY: between(lift, 0, path.lift) }],
                }}
            />

            <Animated.View
                style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: 0,
                    right: 0,
                    alignItems: "center",
                    justifyContent: "center",
                    // Fade out before it arrives, since the bar's own logo is already under the sheet.
                    opacity: lift.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1, 0] }),
                    transform: [
                        { translateX: between(lift, 0, path.logoDx) },
                        { translateY: between(lift, 0, path.logoDy) },
                        { scale: between(lift, 1, BAR_SCALE) },
                    ],
                }}
            >
                <View style={{ flexDirection: "row", alignItems: "center", gap: LOGO_GAP }}>
                    <Animated.View
                        style={{
                            transform: [
                                { translateX: between(form, path.iconStartX, 0) },
                                {
                                    rotate: look.interpolate({
                                        inputRange: [0, 0.3, 0.7, 1],
                                        outputRange: ["0deg", "-14deg", "12deg", "0deg"],
                                    }),
                                },
                                { scale: between(form, path.iconStartScale, 1) },
                            ],
                        }}
                    >
                        <Image
                            source={BINOCULARS}
                            style={{ width: LOGO_ICON, height: LOGO_ICON }}
                            fadeDuration={0}
                        />
                    </Animated.View>
                    <Animated.Text
                        onLayout={(e) => setTextWidth(e.nativeEvent.layout.width)}
                        maxFontSizeMultiplier={MAX_FONT_SCALE}
                        numberOfLines={1}
                        style={{
                            fontFamily: families.bold,
                            fontSize: LOGO_TEXT,
                            color: "#ffffff",
                            opacity: form.interpolate({
                                inputRange: [0, 0.35, 1],
                                outputRange: [0, 0, 1],
                            }),
                            transform: [{ translateX: between(form, 28, 0) }],
                        }}
                    >
                        FTC
                        <Animated.Text style={{ fontFamily: families.italic }}>Scout</Animated.Text>
                    </Animated.Text>
                </View>
            </Animated.View>
        </Animated.View>
    );
}
