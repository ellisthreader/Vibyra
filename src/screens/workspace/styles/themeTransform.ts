import { lightColors } from "../../../styles/theme";
import { StyleSheet } from "react-native";

type RGBA = { r: number; g: number; b: number; a: number };

function parseHex(c: string): RGBA | null {
  const hex = c.slice(1);
  if (hex.length !== 6 && hex.length !== 8) return null;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r: r / 255, g: g / 255, b: b / 255, a };
}

function parseRgb(c: string): RGBA | null {
  const open = c.indexOf("(");
  const close = c.lastIndexOf(")");
  if (open < 0 || close < 0) return null;
  const parts = c.slice(open + 1, close).split(",").map((p) => p.trim());
  if (parts.length !== 3 && parts.length !== 4) return null;
  const r = parseFloat(parts[0]);
  const g = parseFloat(parts[1]);
  const b = parseFloat(parts[2]);
  const a = parts.length === 4 ? parseFloat(parts[3]) : 1;
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a)) return null;
  return { r: r / 255, g: g / 255, b: b / 255, a };
}

function parseColor(c: string): RGBA | null {
  if (c.startsWith("#")) return parseHex(c);
  if (c.startsWith("rgb")) return parseRgb(c);
  return null;
}

function toCss({ r, g, b, a }: RGBA): string {
  const R = Math.round(Math.max(0, Math.min(1, r)) * 255);
  const G = Math.round(Math.max(0, Math.min(1, g)) * 255);
  const B = Math.round(Math.max(0, Math.min(1, b)) * 255);
  const A = Math.max(0, Math.min(1, a));
  if (A >= 0.999) {
    return `#${R.toString(16).padStart(2, "0").toUpperCase()}${G.toString(16).padStart(2, "0").toUpperCase()}${B.toString(16).padStart(2, "0").toUpperCase()}`;
  }
  return `rgba(${R}, ${G}, ${B}, ${Math.round(A * 1000) / 1000})`;
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb({ h, s, l }: { h: number; s: number; l: number }) {
  if (s === 0) return { r: l, g: l, b: l };
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1 / 3),
    g: hue2rgb(p, q, h),
    b: hue2rgb(p, q, h - 1 / 3)
  };
}

const NEUTRAL_CHROMA_THRESHOLD = 0.18;
const LIGHT_TEXT = lightColors.text;
const LIGHT_MUTED = lightColors.muted;
const LIGHT_DIM = lightColors.dim;
const LIGHT_BORDER = lightColors.border;
const LIGHT_BORDER_STRONG = lightColors.borderStrong;
const LIGHT_SURFACE = lightColors.surface;
const LIGHT_ELEVATED = lightColors.elevated;
const LIGHT_BACKGROUND = lightColors.background;
const LIGHT_ACCENT = lightColors.accent;
const LIGHT_ACCENT_HOVER = lightColors.accentHover;
const LIGHT_ACCENT_SOFT = lightColors.accentSoft;
const LIGHT_MAGENTA = lightColors.magenta;
const LIGHT_SUCCESS = lightColors.success;
const LIGHT_SUCCESS_SOFT = lightColors.successSoft;
const LIGHT_WARNING = lightColors.warning;
const LIGHT_ERROR = lightColors.error;
const LIGHT_SHADOW = lightColors.shadow;

const EXACT_LIGHT_COLORS: Record<string, string> = {
  "#02030C": LIGHT_BACKGROUND,
  "#050505": LIGHT_BACKGROUND,
  "#07070A": LIGHT_BACKGROUND,
  "#080A12": LIGHT_BACKGROUND,
  "#0B0D17": LIGHT_BACKGROUND,
  "#0B0C12": LIGHT_BACKGROUND,
  "#080911": LIGHT_BACKGROUND,
  "#0B0913": LIGHT_SURFACE,
  "#0C0B18": LIGHT_SURFACE,
  "#0C0E14": LIGHT_SURFACE,
  "#0C0F1C": LIGHT_SURFACE,
  "#0D0D12": LIGHT_ELEVATED,
  "#101219": LIGHT_SURFACE,
  "#12121A": LIGHT_SURFACE,
  "#13131F": LIGHT_SURFACE,
  "#151621": LIGHT_SURFACE,
  "#FFFFFF": LIGHT_TEXT,
  "#F9F6FF": LIGHT_TEXT,
  "#F3F1FA": LIGHT_TEXT,
  "#F2EFFB": LIGHT_TEXT,
  "#F1ECFF": LIGHT_TEXT,
  "#F1E9FF": LIGHT_TEXT,
  "#EAE5F4": LIGHT_TEXT,
  "#E8E2FF": LIGHT_ACCENT_HOVER,
  "#E8E1FF": LIGHT_ACCENT_HOVER,
  "#EDE9FF": LIGHT_ACCENT_HOVER,
  "#DCD7EA": LIGHT_MUTED,
  "#DDD6F0": LIGHT_MUTED,
  "#D8D2E8": LIGHT_MUTED,
  "#D5D0E6": LIGHT_MUTED,
  "#D3CCE4": LIGHT_MUTED,
  "#D2CBE2": LIGHT_MUTED,
  "#CFC7E6": LIGHT_MUTED,
  "#C8C1D8": LIGHT_MUTED,
  "#DAD6EA": LIGHT_MUTED,
  "#DAD6E7": LIGHT_MUTED,
  "#DAD6F6": LIGHT_MUTED,
  "#D7C4FF": LIGHT_ACCENT_HOVER,
  "#DDBBFF": LIGHT_ACCENT_HOVER,
  "#C9C1DC": LIGHT_MUTED,
  "#BDB9C7": LIGHT_MUTED,
  "#BAB5CA": LIGHT_MUTED,
  "#B8B4C4": LIGHT_MUTED,
  "#B8B8C8": LIGHT_MUTED,
  "#B8B1C8": LIGHT_MUTED,
  "#B7B3C4": LIGHT_MUTED,
  "#B6B3C6": LIGHT_MUTED,
  "#B5B0CA": LIGHT_MUTED,
  "#B5B0C3": LIGHT_MUTED,
  "#B4B1C9": LIGHT_MUTED,
  "#AAA7B7": LIGHT_MUTED,
  "#AAA6BC": LIGHT_DIM,
  "#A9A6BE": LIGHT_MUTED,
  "#A9A5B8": LIGHT_MUTED,
  "#A9A3B8": LIGHT_MUTED,
  "#A8A7BA": LIGHT_MUTED,
  "#A8A2B6": LIGHT_MUTED,
  "#A29CB8": LIGHT_MUTED,
  "#9F99B6": LIGHT_MUTED,
  "#9C97AE": LIGHT_MUTED,
  "#8F8A9E": LIGHT_DIM,
  "#8F8B9F": LIGHT_DIM,
  "#8D879D": LIGHT_DIM,
  "#8D879C": LIGHT_DIM,
  "#8E8AA3": LIGHT_DIM,
  "#858197": LIGHT_DIM,
  "#7A7A8C": LIGHT_DIM,
  "#6F6A80": LIGHT_DIM,
  "#6E6982": LIGHT_DIM,
  "#5C5870": LIGHT_DIM,
  "#5C5470": LIGHT_DIM,
  "#827C92": LIGHT_DIM,
  "#7F788F": LIGHT_DIM,
  "#A95BFF": LIGHT_ACCENT,
  "#A855FF": LIGHT_ACCENT,
  "#B64FFF": LIGHT_ACCENT,
  "#B084FF": LIGHT_ACCENT,
  "#B970FF": LIGHT_ACCENT,
  "#BE62FF": LIGHT_MAGENTA,
  "#C259FF": LIGHT_MAGENTA,
  "#DDFCEB": LIGHT_SUCCESS,
  "#B7FBD0": LIGHT_SUCCESS,
  "#9AE9B4": LIGHT_SUCCESS,
  "#8EF4BA": LIGHT_SUCCESS,
  "#7CF1B3": LIGHT_SUCCESS,
  "#6FEA8E": LIGHT_SUCCESS,
  "#59E8A0": LIGHT_SUCCESS,
  "#55D77D": LIGHT_SUCCESS,
  "#4ADE80": LIGHT_SUCCESS,
  "#3CD783": LIGHT_SUCCESS,
  "#A7F3D0": LIGHT_SUCCESS,
  "#D5FFE2": LIGHT_SUCCESS,
  "#BAE7CB": LIGHT_SUCCESS,
  "#FFF200": LIGHT_WARNING,
  "#FFE89A": LIGHT_WARNING,
  "#FFF4C7": LIGHT_WARNING,
  "#FFD166": LIGHT_WARNING,
  "#FFE1A3": LIGHT_WARNING,
  "#FACC15": LIGHT_WARNING,
  "#FFB4C1": LIGHT_ERROR,
  "#FF9DAE": LIGHT_ERROR,
  "#FF7F96": LIGHT_ERROR,
  "#FF6478": LIGHT_ERROR,
  "#FF5D7A": LIGHT_ERROR,
  "#FF5D5D": LIGHT_ERROR,
  "#FF5A6B": LIGHT_ERROR,
  "#D92D50": LIGHT_ERROR,
  "#4CA3FF": lightColors.info,
  "#8CC8FF": lightColors.info,
  "#7DA3FF": lightColors.info
};

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }) {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function formatAlpha(alpha: number) {
  return Math.round(Math.max(0, Math.min(1, alpha)) * 1000) / 1000;
}

function isBorderKey(key: string) {
  return key.includes("border") || key === "textDecorationColor";
}

function isSurfaceKey(key: string) {
  return key === "backgroundColor" || key === "underlayColor" || key === "overlayColor" || key === "tintColor";
}

function isTextKey(key: string) {
  return key === "color" || key === "placeholderTextColor";
}

function neutralOverlay(alpha: number) {
  return `rgba(18, 19, 26, ${formatAlpha(Math.min(0.18, Math.max(0.06, alpha * 0.8)))})`;
}

function exactLightColor(c: string, key: string) {
  if (c === "#FFFFFF") {
    if (isSurfaceKey(key)) return LIGHT_SURFACE;
    if (isBorderKey(key)) return LIGHT_BORDER;
  }
  return EXACT_LIGHT_COLORS[c];
}

function transformNeutralColorForLight(parsed: RGBA, key: string, hsl: ReturnType<typeof rgbToHsl>): string {
  if (key === "shadowColor") return LIGHT_SHADOW;
  if (parsed.r < 0.03 && parsed.g < 0.03 && parsed.b < 0.03 && parsed.a < 1) {
    return `rgba(18, 19, 26, ${formatAlpha(Math.min(0.46, Math.max(0.22, parsed.a * 0.72)))})`;
  }
  if (isBorderKey(key)) return parsed.a < 0.16 ? neutralOverlay(parsed.a) : LIGHT_BORDER;
  if (isTextKey(key)) {
    if (hsl.l > 0.82) return LIGHT_TEXT;
    if (hsl.l > 0.62) return LIGHT_MUTED;
    if (hsl.l > 0.32) return LIGHT_DIM;
    return LIGHT_TEXT;
  }
  if (isSurfaceKey(key)) {
    if (parsed.a < 1 && hsl.l > 0.72) return neutralOverlay(parsed.a);
    if (hsl.l < 0.08) return LIGHT_BACKGROUND;
    if (hsl.l < 0.18) return LIGHT_SURFACE;
    return LIGHT_ELEVATED;
  }
  const inverted = { ...hsl, l: 1 - hsl.l };
  const rgb = hslToRgb(inverted);
  return toCss({ ...rgb, a: parsed.a });
}

function transformColorForLight(c: string, key = "color"): string {
  const exact = exactLightColor(c, key);
  if (exact) return exact;
  const parsed = parseColor(c);
  if (!parsed) return c;
  const max = Math.max(parsed.r, parsed.g, parsed.b);
  const min = Math.min(parsed.r, parsed.g, parsed.b);
  const chroma = max - min;
  const hsl = rgbToHsl(parsed);

  if (chroma >= NEUTRAL_CHROMA_THRESHOLD) {
    const lum = relativeLuminance(parsed);
    let newL = hsl.l;
    let newAlpha = parsed.a;
    if (isBorderKey(key) && parsed.a < 0.5) {
      return LIGHT_BORDER_STRONG;
    }
    if (isSurfaceKey(key) && parsed.a > 0 && parsed.a < 0.4) {
      const rgb = hslToRgb({ h: hsl.h, s: Math.min(0.74, hsl.s), l: 0.94 });
      return toCss({ ...rgb, a: 1 });
    }
    if (lum > 0.5) {
      newL = 0.42;
    }
    if (parsed.a > 0 && parsed.a < 0.4) {
      newAlpha = Math.min(0.18, parsed.a * 1.5);
    }
    if (Math.abs(newL - hsl.l) < 0.001 && Math.abs(newAlpha - parsed.a) < 0.001) {
      return c;
    }
    const rgb = hslToRgb({ h: hsl.h, s: hsl.s, l: newL });
    return toCss({ ...rgb, a: newAlpha });
  }

  return transformNeutralColorForLight(parsed, key, hsl);
}

const COLOR_KEYS = new Set([
  "color",
  "backgroundColor",
  "borderColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "borderStartColor",
  "borderEndColor",
  "shadowColor",
  "tintColor",
  "textShadowColor",
  "textDecorationColor",
  "overlayColor",
  "placeholderTextColor",
  "underlayColor"
]);

function transformValue(key: string, value: unknown): unknown {
  if (typeof value === "string" && COLOR_KEYS.has(key)) {
    return transformColorForLight(value, key);
  }
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "object" && v !== null ? transformStyleObject(v as Record<string, unknown>) : v));
  }
  if (value && typeof value === "object") {
    return transformStyleObject(value as Record<string, unknown>);
  }
  return value;
}

function transformStyleObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key in obj) {
    out[key] = transformValue(key, obj[key]);
  }
  return out;
}

export function transformStyleMap(map: Record<string, Record<string, unknown>>): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const key in map) {
    out[key] = transformStyleObject(map[key]);
  }
  return out;
}

let activeScheme: "dark" | "light" = "dark";

export function setThemeTransformScheme(scheme: "dark" | "light") {
  activeScheme = scheme;
}

export function createThemedStyleSheet<T extends Record<string, Record<string, unknown>>>(raw: T): any {
  const darkSheet = StyleSheet.create(raw as any);
  const lightSheet = StyleSheet.create(transformStyleMap(raw) as any);

  return new Proxy({} as T, {
    get(_, key: string) {
      const sheet = activeScheme === "light" ? lightSheet : darkSheet;
      return (sheet as Record<string, unknown>)[key] as T[keyof T];
    },
    has(_, key: string) {
      return key in (activeScheme === "light" ? lightSheet : darkSheet);
    },
    ownKeys() {
      return Object.keys(activeScheme === "light" ? lightSheet : darkSheet);
    },
    getOwnPropertyDescriptor(_, key: string) {
      const sheet = activeScheme === "light" ? lightSheet : darkSheet;
      if (key in sheet) {
        return { enumerable: true, configurable: true, value: (sheet as Record<string, unknown>)[key] };
      }
      return undefined;
    }
  });
}

export function themedColor(color: string, scheme: "light" | "dark"): string {
  return scheme === "light" ? transformColorForLight(color) : color;
}
