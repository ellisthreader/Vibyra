import { useSyncExternalStore } from 'react';
import { readFlag, writeFlag } from '../transport/deviceFlags';
import { deviceLanguages } from './deviceLanguages';
import { catalogues } from './catalogues';
import en from './catalogues/en.json';
import { formatDate, formatNumber } from './message';
import { isPreference, type LocalePreference } from './locales';
import { createTranslator } from './translator';

// The phone's translator over its own catalogues (the message format, locale
// matching and pseudo-locale are shared with the desktop). The choice is a device
// flag, read once after launch; until it is read, and until a person picks one,
// the phone shows English.

export type MessageKey = keyof typeof en;

const i18n = createTranslator({
  english: en,
  catalogues,
  deviceLanguages,
  load: () => null,
  save: (preference) => void writeFlag('locale', preference).catch(() => {}),
});

/** Applies the saved choice without writing it back. */
void readFlag('locale')
  .then((saved) => {
    if (isPreference(saved) && saved !== i18n.preference()) i18n.restore(saved);
  })
  .catch(() => {});

export const t = i18n.t;
export const english = (key: MessageKey): string => en[key];
export const currentLocale = i18n.locale;
export const setLocalePreference = (next: LocalePreference) => i18n.setPreference(next);

/** Re-renders on a language change; returns `t` so call sites read naturally. */
export function useT() {
  useSyncExternalStore(i18n.subscribe, i18n.locale, i18n.locale);
  return i18n.t;
}

export function useLocalePreference(): LocalePreference {
  return useSyncExternalStore(i18n.subscribe, i18n.preference, i18n.preference);
}

export const dateText = (value: Date | number, options?: Intl.DateTimeFormatOptions) =>
  formatDate(value, i18n.locale(), options);
export const numberText = (value: number, options?: Intl.NumberFormatOptions) =>
  formatNumber(value, i18n.locale(), options);
