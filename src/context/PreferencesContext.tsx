import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { AppearanceMode } from "../screens/workspace/inline/profile/types";
import { themedColor } from "../screens/workspace/styles/themeTransform";
import { localizedDate, localizedNumber, translate } from "./translations";

const PREFS_KEY = "vibyra.prefs.v1";

type StoredPrefs = {
  appearance: AppearanceMode;
  language: string;
};

const defaults: StoredPrefs = { appearance: "dark", language: "English" };

function getStorage() {
  return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
}

function loadPrefs(): StoredPrefs {
  try {
    const raw = getStorage()?.getItem(PREFS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
    const appearance: AppearanceMode = parsed.appearance === "light" || parsed.appearance === "auto" ? parsed.appearance : "dark";
    const language = typeof parsed.language === "string" && parsed.language.trim() ? parsed.language : "English";
    return { appearance, language };
  } catch {
    return defaults;
  }
}

function savePrefs(prefs: StoredPrefs) {
  try {
    getStorage()?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export type PreferencesValue = {
  appearance: AppearanceMode;
  setAppearance: (mode: AppearanceMode) => void;
  language: string;
  setLanguage: (lang: string) => void;
  effectiveScheme: "dark" | "light";
  formatNumber: (value: number) => string;
  formatDate: (value: Date | string | number) => string;
  t: (key: string) => string;
};

const PreferencesContext = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const initial = useMemo(loadPrefs, []);
  const [appearance, setAppearanceState] = useState<AppearanceMode>(initial.appearance);
  const [language, setLanguageState] = useState<string>(initial.language);
  const systemScheme = useColorScheme();

  useEffect(() => {
    savePrefs({ appearance, language });
  }, [appearance, language]);

  const setAppearance = useCallback((mode: AppearanceMode) => setAppearanceState(mode), []);
  const setLanguage = useCallback((lang: string) => setLanguageState(lang), []);

  const effectiveScheme: "dark" | "light" = useMemo(() => {
    if (appearance === "auto") return systemScheme === "light" ? "light" : "dark";
    return appearance;
  }, [appearance, systemScheme]);

  const formatNumber = useCallback((value: number) => localizedNumber(language, value), [language]);
  const formatDate = useCallback(
    (value: Date | string | number) => {
      const d = value instanceof Date ? value : new Date(value);
      return localizedDate(language, d);
    },
    [language]
  );
  const t = useCallback((key: string) => translate(language, key), [language]);

  const value: PreferencesValue = {
    appearance,
    setAppearance,
    language,
    setLanguage,
    effectiveScheme,
    formatNumber,
    formatDate,
    t
  };

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used inside PreferencesProvider");
  return ctx;
}

export function useThemedColor(color: string): string {
  const { effectiveScheme } = usePreferences();
  return themedColor(color, effectiveScheme);
}

export const LIGHT_SHELL_BG = "#F3F1F8";
export const DARK_SHELL_BG = "#07070A";
