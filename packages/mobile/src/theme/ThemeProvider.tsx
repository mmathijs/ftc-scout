import { createContext, useContext, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { settings } from "@/store/settings";
import { dark, light, type Palette } from "./tokens";

const ThemeContext = createContext<Palette>(light);

export function ThemeProvider({ children }: { children: ReactNode }) {
    let system = useColorScheme();
    let preference = settings.useValue().theme;
    let scheme = preference == "system" ? (system == "dark" ? "dark" : "light") : preference;
    return (
        <ThemeContext.Provider value={scheme == "dark" ? dark : light}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme(): Palette {
    return useContext(ThemeContext);
}
