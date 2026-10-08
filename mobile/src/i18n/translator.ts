/**
 * One translator per app: its own English catalogue is the source of truth and
 * the type of every key; other languages may lack a key, and English fills in.
 * No React in here (the desktop imports this file and has its own React copy);
 * each app wraps `subscribe`/`snapshot` in its own `useLocale`.
 */
import {
  DEFAULT_PREFERENCE,
  isPreference,
  resolveLocale,
  type Locale,
  type LocalePreference,
  type ResolvedLocale,
} from './locales';
import { formatMessage, type MessageParams } from './message';

export type Catalogue<E extends Record<string, string>> = Partial<Record<keyof E & string, string>>;

export interface TranslatorConfig<E extends Record<string, string>> {
  english: E;
  catalogues: Partial<Record<Locale, Catalogue<E>>>;
  deviceLanguages(): readonly string[];
  /** The saved choice, if any; a bad or missing value means the default. */
  load(): string | null;
  save(preference: LocalePreference): void;
}

const MAP: Record<string, string> = {
  a: 'à', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'î', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ',
  n: 'ñ', o: 'ö', p: 'þ', q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ', u: 'û', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'À', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Î', J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ',
  N: 'Ñ', O: 'Ö', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Û', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

/** Every letter accented and the whole string bracketed: text that did not come
 * from a catalogue stands out in a screenshot and fails the test for it. */
export function pseudoize(text: string): string {
  return `⟦${[...text].map((char) => MAP[char] ?? char).join('')}⟧`;
}

export function createTranslator<E extends Record<string, string>>(config: TranslatorConfig<E>) {
  type Key = keyof E & string;
  const listeners = new Set<() => void>();
  const saved = config.load();
  let preference: LocalePreference = isPreference(saved) ? saved : DEFAULT_PREFERENCE;
  let locale: ResolvedLocale = resolveLocale(preference, config.deviceLanguages());

  function t(key: Key, params?: MessageParams): string {
    const own = locale === 'pseudo' || locale === 'en' ? undefined : config.catalogues[locale]?.[key];
    const text = formatMessage(own ?? config.english[key], params, locale === 'pseudo' ? 'en' : own ? locale : 'en');
    return locale === 'pseudo' ? pseudoize(text) : text;
  }

  return {
    t,
    /** The locale in use now (never `system`). Also the snapshot for `useSyncExternalStore`. */
    locale: (): ResolvedLocale => locale,
    preference: (): LocalePreference => preference,
    /** Takes a choice already saved (read after launch) without saving it again. */
    restore(next: LocalePreference) {
      preference = next;
      locale = resolveLocale(next, config.deviceLanguages());
      listeners.forEach((listener) => listener());
    },
    setPreference(next: LocalePreference) {
      this.restore(next);
      config.save(next);
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type Translator<E extends Record<string, string>> = ReturnType<typeof createTranslator<E>>;
