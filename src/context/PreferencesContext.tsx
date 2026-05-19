import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { darkColors, lightColors } from "../styles/theme";
import { AppearanceMode } from "../screens/workspace/inline/profile/types";
import { themedColor } from "../screens/workspace/styles/themeTransform";
import { readStorageItem, readStorageItemSync, writeStorageItem } from "../utils/nativeStorage";
import { localizedDate, localizedNumber, translate } from "./translations";

const PREFS_KEY = "vibyra.prefs.v1";

type StoredPrefs = {
  appearance: AppearanceMode;
  language: string;
  notifications: NotificationPreferences;
  improveVibyra: boolean;
  appLockEnabled: boolean;
};

export type NotificationPreferenceKey = keyof NotificationPreferences;

export type NotificationPreferences = {
  buildUpdates: boolean;
  chatReplies: boolean;
  productUpdates: boolean;
};

const defaultNotifications: NotificationPreferences = {
  buildUpdates: true,
  chatReplies: true,
  productUpdates: false
};

const defaults: StoredPrefs = {
  appearance: "dark",
  language: "English",
  notifications: defaultNotifications,
  improveVibyra: false,
  appLockEnabled: false
};

function parseNotifications(raw: Partial<NotificationPreferences> | undefined): NotificationPreferences {
  return {
    buildUpdates: typeof raw?.buildUpdates === "boolean" ? raw.buildUpdates : defaultNotifications.buildUpdates,
    chatReplies: typeof raw?.chatReplies === "boolean" ? raw.chatReplies : defaultNotifications.chatReplies,
    productUpdates: typeof raw?.productUpdates === "boolean" ? raw.productUpdates : defaultNotifications.productUpdates
  };
}

function parsePrefs(raw: string | null): StoredPrefs {
  try {
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
    const appearance: AppearanceMode = parsed.appearance === "light" || parsed.appearance === "auto" ? parsed.appearance : "dark";
    const language = typeof parsed.language === "string" && parsed.language.trim() ? parsed.language : "English";
    const improveVibyra = typeof parsed.improveVibyra === "boolean" ? parsed.improveVibyra : false;
    const appLockEnabled = typeof parsed.appLockEnabled === "boolean" ? parsed.appLockEnabled : false;
    return { appearance, language, notifications: parseNotifications(parsed.notifications), improveVibyra, appLockEnabled };
  } catch {
    return defaults;
  }
}

function loadPrefsSync(): StoredPrefs {
  return parsePrefs(readStorageItemSync(PREFS_KEY));
}

async function loadPrefs(): Promise<StoredPrefs> {
  return parsePrefs(await readStorageItem(PREFS_KEY));
}

async function savePrefs(prefs: StoredPrefs) {
  try {
    await writeStorageItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export type PreferencesValue = {
  appearance: AppearanceMode;
  preferencesReady: boolean;
  setAppearance: (mode: AppearanceMode) => void;
  language: string;
  setLanguage: (lang: string) => void;
  notifications: NotificationPreferences;
  setNotificationPreference: (key: NotificationPreferenceKey, value: boolean) => void;
  improveVibyra: boolean;
  setImproveVibyra: (value: boolean) => void;
  appLockEnabled: boolean;
  setAppLockEnabled: (value: boolean) => void;
  effectiveScheme: "dark" | "light";
  formatNumber: (value: number) => string;
  formatDate: (value: Date | string | number) => string;
  t: (key: string) => string;
  colors: typeof darkColors;
};

const PreferencesContext = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const initial = useMemo(loadPrefsSync, []);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [appearance, setAppearanceState] = useState<AppearanceMode>(initial.appearance);
  const [language, setLanguageState] = useState<string>(initial.language);
  const [notifications, setNotifications] = useState<NotificationPreferences>(initial.notifications);
  const [improveVibyra, setImproveVibyraState] = useState<boolean>(initial.improveVibyra);
  const [appLockEnabled, setAppLockEnabledState] = useState<boolean>(initial.appLockEnabled);
  const systemScheme = useColorScheme();

  useEffect(() => {
    let cancelled = false;
    loadPrefs()
      .then((prefs) => {
        if (cancelled) return;
        setAppearanceState(prefs.appearance);
        setLanguageState(prefs.language);
        setNotifications(prefs.notifications);
        setImproveVibyraState(prefs.improveVibyra);
        setAppLockEnabledState(prefs.appLockEnabled);
      })
      .finally(() => {
        if (!cancelled) setPreferencesReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    void savePrefs({ appearance, language, notifications, improveVibyra, appLockEnabled });
  }, [appearance, language, notifications, improveVibyra, appLockEnabled, preferencesReady]);

  const setAppearance = useCallback((mode: AppearanceMode) => setAppearanceState(mode), []);
  const setLanguage = useCallback((lang: string) => setLanguageState(lang), []);
  const setNotificationPreference = useCallback((key: NotificationPreferenceKey, next: boolean) => {
    setNotifications((current) => ({ ...current, [key]: next }));
  }, []);
  const setImproveVibyra = useCallback((next: boolean) => setImproveVibyraState(next), []);
  const setAppLockEnabled = useCallback((next: boolean) => setAppLockEnabledState(next), []);

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
    preferencesReady,
    setAppearance,
    language,
    setLanguage,
    notifications,
    setNotificationPreference,
    improveVibyra,
    setImproveVibyra,
    appLockEnabled,
    setAppLockEnabled,
    effectiveScheme,
    formatNumber,
    formatDate,
    t,
    colors: effectiveScheme === "light" ? lightColors : darkColors
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

export const LIGHT_SHELL_BG = lightColors.background;
export const DARK_SHELL_BG = darkColors.background;
