/**
 * The languages Vibyra's own screens are written in, and how a device language
 * tag maps onto one. English is the source; the rest are first drafts that still
 * need a native reader (see README.md beside the catalogues). Right-to-left
 * languages are not supported yet.
 */
export type Locale = 'en' | 'es' | 'fr' | 'de' | 'ja' | 'zh-Hans' | 'pt-BR';
/** A choice a person can make. `pseudo` exists for tests and is never offered. */
export type LocalePreference = Locale | 'system' | 'pseudo';
export type ResolvedLocale = Locale | 'pseudo';

/** Each language is named in itself, so it can be found when the UI is unreadable. */
export const LOCALES: readonly { id: Locale; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
  { id: 'fr', name: 'Français' },
  { id: 'de', name: 'Deutsch' },
  { id: 'ja', name: '日本語' },
  { id: 'zh-Hans', name: '简体中文' },
  { id: 'pt-BR', name: 'Português (Brasil)' },
];

export const DEFAULT_PREFERENCE: LocalePreference = 'en';

/** The Intl tag for a locale (Intl knows `zh-Hans` and `pt-BR` as written). */
export const intlTag = (locale: ResolvedLocale): string => (locale === 'pseudo' ? 'en' : locale);

export function isPreference(value: unknown): value is LocalePreference {
  return (
    value === 'system' ||
    value === 'pseudo' ||
    LOCALES.some((locale) => locale.id === value)
  );
}

/** One device language tag (`es-MX`, `zh_CN`, `pt-PT`) as a supported locale, or null. */
export function matchLocale(tag: string): Locale | null {
  const parts = tag.trim().toLowerCase().replace(/_/g, '-').split('-');
  switch (parts[0]) {
    case 'en':
      return 'en';
    case 'es':
      return 'es';
    case 'fr':
      return 'fr';
    case 'de':
      return 'de';
    case 'ja':
      return 'ja';
    case 'pt':
      return 'pt-BR';
    case 'zh':
      // Traditional Chinese is not drafted yet; do not guess at it.
      return parts.some((part) => ['hant', 'tw', 'hk', 'mo'].includes(part)) ? null : 'zh-Hans';
    default:
      return null;
  }
}

/** The locale to show: the person's choice, or the first device language we have. */
export function resolveLocale(
  preference: LocalePreference,
  deviceLanguages: readonly string[],
): ResolvedLocale {
  if (preference === 'pseudo') return 'pseudo';
  if (preference !== 'system') return preference;
  for (const tag of deviceLanguages) {
    const found = matchLocale(tag);
    if (found) return found;
  }
  return 'en';
}
