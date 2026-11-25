import type { ComponentRef, Ref } from "react";
import { Platform, TextInput, View, type TextInputProps } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { families, font, MAX_FONT_SCALE, radius, space, TAP } from "@/theme/tokens";
import { IconButton } from "./Button";
import { Icon } from "./Icon";

// The browser preview draws its own focus ring inside the field's border.
const WEB_NO_OUTLINE = Platform.OS == "web" ? ({ outlineStyle: "none" } as any) : null;

export type TextInputRef = ComponentRef<typeof TextInput>;

export function SearchField({
    value,
    onChangeText,
    style,
    ref,
    plain,
    ...rest
}: TextInputProps & {
    value: string;
    onChangeText: (t: string) => void;
    ref?: Ref<TextInputRef>;
    plain?: boolean;
}) {
    let c = useTheme();
    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                minHeight: TAP - 2,
                borderWidth: 1,
                borderColor: c.sep,
                borderRadius: radius.md,
                backgroundColor: plain ? c.surface : c.form,
                paddingLeft: space.md,
            }}
        >
            <Icon name="magnifying-glass" size={15} color={c.textSecondary} />
            <TextInput
                ref={ref}
                value={value}
                onChangeText={onChangeText}
                placeholderTextColor={c.textMuted}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                {...rest}
                style={[
                    {
                        flex: 1,
                        // Inputs don't shrink below their text by themselves, which pushes the
                        // clear button off a narrow screen.
                        minWidth: 0,
                        minHeight: TAP - 4,
                        paddingHorizontal: space.sm,
                        color: c.text,
                        fontFamily: families.regular,
                        fontSize: font.md,
                    },
                    WEB_NO_OUTLINE,
                    style,
                ]}
            />
            {value ? (
                <IconButton
                    icon="xmark"
                    label="Clear"
                    onPress={() => onChangeText("")}
                    color={c.textSecondary}
                    size={16}
                />
            ) : null}
        </View>
    );
}
