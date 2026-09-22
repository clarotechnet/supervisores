import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type AppTheme = "light" | "dark";

const THEME_STORAGE_KEY = "technet-color-theme";

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function preferredTheme(): AppTheme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: AppTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset["theme"] = theme;
  document.documentElement.style.colorScheme = theme;
}

// eslint-disable-next-line react-refresh/only-export-components -- o bootstrap precisa usar a mesma preferência persistida do provider.
export function initializeTheme(): AppTheme {
  const theme = preferredTheme();
  applyTheme(theme);
  return theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    if (typeof document !== "undefined") {
      const current = document.documentElement.dataset["theme"];
      if (current === "light" || current === "dark") return current;
    }
    return preferredTheme();
  });

  useEffect(() => applyTheme(theme), [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: (nextTheme) => {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        applyTheme(nextTheme);
        setThemeState(nextTheme);
      },
      toggleTheme: () => {
        setThemeState((current) => {
          const nextTheme = current === "dark" ? "light" : "dark";
          window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
          applyTheme(nextTheme);
          return nextTheme;
        });
      },
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook público do provider de tema.
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme precisa ser usado dentro de ThemeProvider.");
  return context;
}
