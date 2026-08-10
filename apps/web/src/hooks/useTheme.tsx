import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

/** Light/dark/system theme preference value. */
export type ThemePreference = "light" | "dark" | "system";

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const storageKey = "flowledger.theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function getStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";

  const storedPreference = window.localStorage.getItem(storageKey);
  return storedPreference === "light" || storedPreference === "dark" || storedPreference === "system"
    ? storedPreference
    : "system";
}

function prefersDarkMode() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(preference: ThemePreference) {
  const shouldUseDarkMode = preference === "dark" || (preference === "system" && prefersDarkMode());
  document.documentElement.classList.toggle("dark", shouldUseDarkMode);
  document.documentElement.style.colorScheme = shouldUseDarkMode ? "dark" : "light";
}

/** React context provider managing theme preference and applying it to the document. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(getStoredPreference);

  useEffect(() => {
    applyTheme(preference);

    if (preference !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => applyTheme("system");
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [preference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      setPreference: (nextPreference) => {
        window.localStorage.setItem(storageKey, nextPreference);
        setPreferenceState(nextPreference);
      }
    }),
    [preference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Reads the current `ThemeProvider` context; throws if used outside it. */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
