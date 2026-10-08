import { useSyncExternalStore } from "react";

import { createTranslator } from "../../../mobile/src/i18n/translator";
import type { LocalePreference, ResolvedLocale } from "../../../mobile/src/i18n/locales";
import { catalogues } from "./catalogues/index";
import en from "./catalogues/en.json";

// Desktop's own copy of the translator, over its own catalogues. The message
// format, locale matching and pseudo-locale are the phone's (shared, no React).
// The choice is a per-computer preference, kept in localStorage like the other
// window preferences; the default is English until the person picks otherwise.

const KEY = "vibyra.locale";

export type MessageKey = keyof typeof en;

const i18n = createTranslator({
  english: en,
  catalogues,
  deviceLanguages: () => (typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language]),
  load: () => {
    try { return localStorage.getItem(KEY); } catch { return null; }
  },
  save: (preference) => {
    try { localStorage.setItem(KEY, preference); } catch { /* the choice lasts until restart */ }
  },
});

/** The English source text, for searching in both the shown language and English. */
export const english = (key: MessageKey): string => en[key];
export const setLocalePreference = (next: LocalePreference) => i18n.setPreference(next);

/** Re-renders on a language change; returns `t` so call sites read naturally. */
export function useT() {
  useSyncExternalStore(i18n.subscribe, i18n.locale);
  return i18n.t;
}

export function useLocalePreference(): [LocalePreference, ResolvedLocale] {
  useSyncExternalStore(i18n.subscribe, i18n.preference);
  return [i18n.preference(), i18n.locale()];
}
