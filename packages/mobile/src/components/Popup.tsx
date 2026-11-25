import type { ReactNode } from "react";
import { Modal, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space, TAP } from "@/theme/tokens";
import { IconButton } from "./Button";
import { Press } from "./Pressable";
import { Txt } from "./Txt";

const POPUP_CHROME = 48 + TAP;

// A phone on its side is about 360 high, so lists inside popups are capped to fit.
export function usePopupRoom(above = 0): number {
    let { height } = useWindowDimensions();
    let insets = useSafeAreaInsets();
    return Math.max(
        TAP * 2,
        height - insets.top - insets.bottom - 2 * space.md - POPUP_CHROME - above
    );
}

export function Popup({
    visible,
    onClose,
    title,
    children,
    scroll = true,
}: {
    visible: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    scroll?: boolean;
}) {
    let c = useTheme();
    let insets = useSafeAreaInsets();
    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
            statusBarTranslucent
            aria-label={title}
        >
            <View
                style={{
                    flex: 1,
                    justifyContent: "center",
                    paddingHorizontal: space.md,
                    paddingTop: insets.top + space.md,
                    paddingBottom: insets.bottom + space.md,
                }}
            >
                {/* Not a pressable, so keyboard focus doesn't start behind the panel. */}
                <View
                    style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: 0,
                        right: 0,
                        backgroundColor: c.scrim,
                    }}
                    onStartShouldSetResponder={() => true}
                    onResponderRelease={onClose}
                    accessible={false}
                    aria-hidden
                    importantForAccessibility="no"
                />
                <View
                    accessibilityViewIsModal
                    onAccessibilityEscape={onClose}
                    style={{
                        backgroundColor: c.surface,
                        borderRadius: radius.md,
                        overflow: "hidden",
                        maxHeight: "100%",
                        width: "100%",
                        maxWidth: 560,
                        alignSelf: "center",
                    }}
                >
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            paddingLeft: space.md,
                        }}
                    >
                        <Txt
                            size="xl"
                            weight="bold"
                            accessibilityRole="header"
                            numberOfLines={1}
                            style={{ flex: 1 }}
                        >
                            {title}
                        </Txt>
                        <IconButton icon="xmark" label="Close" onPress={onClose} color={c.text} />
                    </View>
                    {scroll ? (
                        <ScrollView
                            style={{ flexShrink: 1 }}
                            contentContainerStyle={{
                                paddingHorizontal: space.sm,
                                paddingBottom: space.md,
                            }}
                        >
                            {children}
                        </ScrollView>
                    ) : (
                        children
                    )}
                    <Press
                        onPress={onClose}
                        accessibilityRole="button"
                        style={{
                            minHeight: TAP,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: c.theme,
                        }}
                    >
                        <Txt weight="bold" color={c.onTheme}>
                            Close
                        </Txt>
                    </Press>
                </View>
            </View>
        </Modal>
    );
}
