import { de } from "./i18n/de";
import { en } from "./i18n/en";
import { es } from "./i18n/es";
import { fr } from "./i18n/fr";
import { ja } from "./i18n/ja";
import { pt } from "./i18n/pt";
import { zh } from "./i18n/zh";
import type { Dict, Lang } from "./i18n/types";

const TRANSLATIONS: Record<Lang, Dict> = {
  English: en,
  "Español": es,
  "Français": fr,
  "Deutsch": de,
  "日本語": ja,
  "中文": zh,
  "Português": pt
};

export function translate(language: string, key: string): string {
  const dict = (TRANSLATIONS as Record<string, Dict>)[language] ?? en;
  return dict[key] ?? en[key] ?? key;
}

const MONTHS_LONG: Record<Lang, string[]> = {
  English: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  "Español": ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  "Français": ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  "Deutsch": ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
  "日本語": ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
  "中文": ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
  "Português": ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
};

export function localizedDate(language: string, date: Date): string {
  const lang = (language as Lang) in MONTHS_LONG ? (language as Lang) : "English";
  const months = MONTHS_LONG[lang];
  const d = date.getDate();
  const m = months[date.getMonth()];
  const y = date.getFullYear();
  switch (lang) {
    case "English": return `${m} ${d}, ${y}`;
    case "Español": return `${d} de ${m} de ${y}`;
    case "Français": return `${d} ${m} ${y}`;
    case "Deutsch": return `${d}. ${m} ${y}`;
    case "日本語": return `${y}年${date.getMonth() + 1}月${d}日`;
    case "中文": return `${y}年${date.getMonth() + 1}月${d}日`;
    case "Português": return `${d} de ${m} de ${y}`;
  }
}

const NUMBER_SEPARATORS: Record<Lang, string> = {
  English: ",",
  "Español": ".",
  "Français": " ",
  "Deutsch": ".",
  "日本語": ",",
  "中文": ",",
  "Português": " "
};

export function localizedNumber(language: string, value: number): string {
  const lang = (language as Lang) in NUMBER_SEPARATORS ? (language as Lang) : "English";
  const sep = NUMBER_SEPARATORS[lang];
  const isNegative = value < 0;
  const abs = Math.abs(Math.round(value));
  const str = abs.toString();
  let out = "";
  for (let i = 0; i < str.length; i++) {
    if (i > 0 && (str.length - i) % 3 === 0) out += sep;
    out += str[i];
  }
  return isNegative ? `-${out}` : out;
}
