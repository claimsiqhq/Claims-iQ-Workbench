import { useEffect, useState } from "react";

export const STORAGE_KEY_THEME = "claims-iq-theme";
export const STORAGE_KEY_OPERATOR = "claims-iq-operator-id";

export type Theme = "light" | "dark" | "system";

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const v = localStorage.getItem(STORAGE_KEY_THEME);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "light";
}

function prefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyToDocument(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const useDark = theme === "dark" || (theme === "system" && prefersDark());
  if (useDark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function useSyncTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    applyToDocument(theme);
  }, [theme]);

  useEffect(() => {
    const stored = getStoredTheme();
    setThemeState(stored);
    applyToDocument(stored);
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applyToDocument("system");
    m.addEventListener("change", listener);
    return () => m.removeEventListener("change", listener);
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY_THEME, t);
    } catch {
      /* ignore */
    }
    applyToDocument(t);
  };

  return [theme, setTheme];
}

export function initTheme(): void {
  applyToDocument(getStoredTheme());
}
