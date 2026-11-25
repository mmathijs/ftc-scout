import { useEffect, useRef, useState } from "react";
import { Animated, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";
import { Card } from "./Card";

const SHOW_AFTER_MS = 350;

const WIDTHS = ["90%", "75%", "60%", "80%"] as const;

export function Skeleton({ rows = 6, title = true }: { rows?: number; title?: boolean }) {
    let c = useTheme();
    let pulse = useRef(new Animated.Value(0.45)).current;
    // Only drawn after a short wait, since bars that flash for a moment read as a flicker.
    let [shown, setShown] = useState(false);
    useEffect(() => {
        let t = setTimeout(() => setShown(true), SHOW_AFTER_MS);
        return () => clearTimeout(t);
    }, []);
    useEffect(() => {
        let loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 0.45, duration: 800, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [pulse]);

    if (!shown) return null;

    return (
        <Card>
            <Animated.View
                style={{ opacity: pulse, gap: space.md }}
                accessible
                accessibilityLabel="Loading"
                accessibilityRole="progressbar"
            >
                {title ? (
                    <View
                        style={{
                            height: 26,
                            width: "55%",
                            borderRadius: radius.sm,
                            backgroundColor: c.raised,
                        }}
                    />
                ) : null}
                {Array.from({ length: rows }, (_, i) => (
                    <View
                        key={i}
                        style={{
                            height: 14,
                            width: WIDTHS[i % WIDTHS.length],
                            borderRadius: radius.sm,
                            backgroundColor: c.raised,
                        }}
                    />
                ))}
            </Animated.View>
        </Card>
    );
}
