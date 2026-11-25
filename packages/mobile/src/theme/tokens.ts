// Colors from the global.css

export type Palette = {
    scheme: "light" | "dark";

    bg: string;
    surface: string;
    zebra: string;
    raised: string;
    form: string;
    sep: string;
    scrim: string;
    fade: string;
    fadeStrength: number;

    theme: string;
    onTheme: string;
    accent: string;
    link: string;

    text: string;
    textSecondary: string;
    textMuted: string;

    red: string;
    blue: string;
    purple: string;
    redText: string;
    blueText: string;
    purpleText: string;
    redTint: string;
    blueTint: string;
    purpleTint: string;
    redTintZebra: string;
    blueTintZebra: string;

    stat: Record<StatColor, { fill: string; tint: string; tintZebra: string }>;

    late: string;
    early: string;
    alert: string;
    onAlert: string;
    inverse: string;
    onInverse: string;
};

export type StatColor = "white" | "red" | "blue" | "light-blue" | "green" | "purple";

export const light: Palette = {
    scheme: "light",
    bg: "#f2f2f2",
    surface: "#ffffff",
    zebra: "#f5f5f5",
    raised: "#f0f0f0",
    form: "#efefef",
    sep: "#d3d3d3",
    scrim: "rgba(0,0,0,0.4)",
    fade: "#000000",
    fadeStrength: 0.16,

    theme: "#2c666e",
    onTheme: "#ffffff",
    accent: "#2c666e",
    link: "#0000ee",

    text: "#000000",
    textSecondary: "#606163",
    // Darker than the website's #808080 so small text passes WCAG AA.
    textMuted: "#6b6b6b",

    red: "#f44336",
    blue: "#2196f3",
    purple: "#aa00ff",
    redText: "#f44336",
    // Darker than the website's #2196f3, which is too faint as text on a striped row.
    blueText: "#1e88e5",
    purpleText: "#aa00ff",
    redTint: "#fde3e1",
    blueTint: "#deeffd",
    purpleTint: "#f2d9ff",
    redTintZebra: "#f3dad8",
    blueTintZebra: "#d5e6f3",

    stat: {
        white: { fill: "#ffffff", tint: "#ffffff", tintZebra: "#f5f5f5" },
        red: { fill: "#f44336", tint: "#fde3e1", tintZebra: "#f3dad8" },
        blue: { fill: "#1976d2", tint: "#dceaf8", tintZebra: "#d3e1ee" },
        "light-blue": { fill: "#2196f3", tint: "#deeffd", tintZebra: "#d5e6f3" },
        green: { fill: "#43a047", tint: "#e3f1e3", tintZebra: "#dae7da" },
        purple: { fill: "#aa00ff", tint: "#f2d9ff", tintZebra: "#e8d0f5" },
    },

    late: "#c87000",
    early: "#2e7d32",
    alert: "#fca016",
    onAlert: "#000000",
    inverse: "#212121",
    onInverse: "#ffffff",
};

export const dark: Palette = {
    scheme: "dark",
    bg: "#161616",
    surface: "#2d2d2d",
    zebra: "#353535",
    raised: "#3a3a3a",
    form: "#191919",
    sep: "#4a4e51",
    scrim: "rgba(0,0,0,0.6)",
    fade: "#ffffff",
    fadeStrength: 0.14,

    theme: "#1f4c52",
    onTheme: "#ffffff",
    accent: "#4a9aa5",
    link: "#9e9eff",

    text: "#dfe2e6",
    textSecondary: "#b7b7b8",
    textMuted: "#a8a8a8",

    red: "#af1d1d",
    blue: "#1b57b3",
    purple: "#7f00be",
    redText: "#ff5347",
    blueText: "#2196f3",
    purpleText: "#c44fff",
    redTint: "#552e2e",
    blueTint: "#29384f",
    purpleTint: "#422251",
    redTintZebra: "#5c3737",
    blueTintZebra: "#324056",

    stat: {
        white: { fill: "#2d2d2d", tint: "#2d2d2d", tintZebra: "#353535" },
        red: { fill: "#cc2f2f", tint: "#452d2d", tintZebra: "#4c3535" },
        blue: { fill: "#1b57b3", tint: "#2a3341", tintZebra: "#333b49" },
        "light-blue": { fill: "#1976d2", tint: "#2a3846", tintZebra: "#33404e" },
        green: { fill: "#2e7d32", tint: "#2d392e", tintZebra: "#354136" },
        purple: { fill: "#7f00be", tint: "#392643", tintZebra: "#412f4b" },
    },

    late: "#ffb74d",
    early: "#81c784",
    alert: "#9c6510",
    onAlert: "#ffffff",
    inverse: "#dfe2e6",
    onInverse: "#161616",
};

export const font = { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 26 } as const;
export type FontSize = keyof typeof font;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 4, md: 8, pill: 999 } as const;

export const TAP = 44;

// Text follows the system size up to this so tables keep their columns.
export const MAX_FONT_SCALE = 1.3;

export const families = {
    regular: "Inter_400Regular",
    italic: "Inter_400Regular_Italic",
    semibold: "Inter_600SemiBold",
    bold: "Inter_700Bold",
} as const;
