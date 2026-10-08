/**
 * A small ICU MessageFormat subset, enough for UI copy: `{name}`, `{n, number}`,
 * `{d, date}`, `{n, plural, one {# file} other {# files}}` and `{x, select, a {..} other {..}}`.
 * Plural categories come from the platform's `Intl.PluralRules`; Hermes (the
 * phone's engine) has none, so the languages we ship fall back to their CLDR rules.
 * An apostrophe quotes only before `{` or `}` ('' is one apostrophe), as in ICU.
 */
import { intlTag, type ResolvedLocale } from './locales';

export type MessageParams = Record<string, string | number | Date>;

type Part =
  | string
  | { arg: string; kind: 'plain' | 'number' | 'date' }
  | { arg: string; kind: 'plural' | 'select'; cases: Record<string, Part[]> };

const cache = new Map<string, Part[]>();

function parse(source: string): Part[] {
  const hit = cache.get(source);
  if (hit) return hit;
  let at = 0;
  const readText = (inPlural: boolean, nested: boolean): Part[] => {
    const parts: Part[] = [];
    let text = '';
    const flush = () => {
      if (text) parts.push(text);
      text = '';
    };
    while (at < source.length) {
      const char = source[at];
      if (char === "'") {
        const next = source[at + 1];
        if (next === "'") { text += "'"; at += 2; continue; }
        if (next === '{' || next === '}') {
          at += 1;
          while (at < source.length && source[at] !== "'") text += source[at++];
          at += 1;
          continue;
        }
      }
      if (char === '}' && nested) break;
      if (char === '{') { flush(); parts.push(readArgument()); continue; }
      if (char === '#' && inPlural) { flush(); parts.push({ arg: '#', kind: 'number' }); at += 1; continue; }
      text += char;
      at += 1;
    }
    flush();
    return parts;
  };
  const readArgument = (): Part => {
    at += 1; // {
    const end = (stops: string) => {
      const from = at;
      while (at < source.length && !stops.includes(source[at])) at += 1;
      return source.slice(from, at).trim();
    };
    const arg = end(',}');
    if (source[at] === '}') { at += 1; return { arg, kind: 'plain' }; }
    at += 1; // ,
    const kind = end(',}');
    if (kind === 'number' || kind === 'date') {
      if (source[at] === ',') end('}');
      at += 1;
      return { arg, kind };
    }
    at += 1; // ,
    const cases: Record<string, Part[]> = {};
    for (;;) {
      while (source[at] === ' ' || source[at] === '\n') at += 1;
      if (at >= source.length || source[at] === '}') break;
      const selector = end('{ ');
      while (source[at] === ' ') at += 1;
      at += 1; // {
      cases[selector] = readText(kind === 'plural', true);
      at += 1; // }
    }
    at += 1;
    return { arg, kind: kind === 'plural' ? 'plural' : 'select', cases };
  };
  const parts = readText(false, false);
  cache.set(source, parts);
  return parts;
}

/** CLDR plural categories for the shipped languages, used where Intl has no PluralRules. */
function fallbackCategory(locale: ResolvedLocale, n: number): string {
  if (locale === 'ja' || locale === 'zh-Hans') return 'other';
  if (locale === 'fr' || locale === 'pt-BR') return n >= 0 && n < 2 ? 'one' : 'other';
  return n === 1 ? 'one' : 'other';
}

function category(locale: ResolvedLocale, n: number): string {
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.PluralRules === 'function')
      return new Intl.PluralRules(intlTag(locale)).select(n);
  } catch {
    /* fall through */
  }
  return fallbackCategory(locale, n);
}

export function formatNumber(value: number, locale: ResolvedLocale, options?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(intlTag(locale), options).format(value);
  } catch {
    return String(value);
  }
}

export function formatDate(
  value: Date | number,
  locale: ResolvedLocale,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  try {
    return new Intl.DateTimeFormat(intlTag(locale), options).format(value);
  } catch {
    return new Date(value).toISOString().slice(0, 10);
  }
}

function render(parts: Part[], params: MessageParams, locale: ResolvedLocale, hash?: number): string {
  let out = '';
  for (const part of parts) {
    if (typeof part === 'string') { out += part; continue; }
    if (part.arg === '#') { out += formatNumber(hash ?? 0, locale); continue; }
    const value = params[part.arg];
    if (value === undefined) { out += `{${part.arg}}`; continue; }
    if (part.kind === 'plain') out += String(value);
    else if (part.kind === 'number') out += formatNumber(Number(value), locale);
    else if (part.kind === 'date') out += formatDate(value as Date | number, locale);
    else if (part.kind === 'plural' && 'cases' in part) {
      const n = Number(value);
      const chosen = part.cases[`=${n}`] ?? part.cases[category(locale, n)] ?? part.cases.other ?? [];
      out += render(chosen, params, locale, n);
    } else if ('cases' in part) out += render(part.cases[String(value)] ?? part.cases.other ?? [], params, locale, hash);
  }
  return out;
}

export function formatMessage(template: string, params: MessageParams | undefined, locale: ResolvedLocale): string {
  if (!params && !template.includes("'") && !/[{}]/.test(template)) return template;
  return render(parse(template), params ?? {}, locale);
}
