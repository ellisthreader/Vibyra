import type { Locale } from '../locales';
import type { Catalogue } from '../translator';
import type en from './en.json';
import de from './de.json';
import es from './es.json';
import fr from './fr.json';
import ja from './ja.json';
import ptBR from './pt-BR.json';
import zhHans from './zh-Hans.json';

/** English is the source and is read directly; every other language may omit a key. */
export const catalogues: Partial<Record<Locale, Catalogue<typeof en>>> = {
  es,
  fr,
  de,
  ja,
  'pt-BR': ptBR,
  'zh-Hans': zhHans,
};
