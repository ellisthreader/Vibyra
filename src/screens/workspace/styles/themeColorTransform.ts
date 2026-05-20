import {
  EXACT_LIGHT_COLORS,
  LIGHT_BACKGROUND,
  LIGHT_BORDER,
  LIGHT_BORDER_STRONG,
  LIGHT_DIM,
  LIGHT_ELEVATED,
  LIGHT_MUTED,
  LIGHT_SHADOW,
  LIGHT_SURFACE,
  LIGHT_TEXT
} from "./themeLightColors";

type RGBA = { r: number; g: number; b: number; a: number };

const NEUTRAL_CHROMA_THRESHOLD = 0.18;

export function transformColorForLight(c: string, key = "color"): string {
  const exact = exactLightColor(c, key);
  if (exact) return exact;
  const parsed = parseColor(c);
  if (!parsed) return c;
  const max = Math.max(parsed.r, parsed.g, parsed.b);
  const min = Math.min(parsed.r, parsed.g, parsed.b);
  const chroma = max - min;
  const hsl = rgbToHsl(parsed);
  return chroma >= NEUTRAL_CHROMA_THRESHOLD
    ? transformChromaColorForLight(c, key, parsed, hsl)
    : transformNeutralColorForLight(parsed, key, hsl);
}

function transformChromaColorForLight(c: string, key: string, parsed: RGBA, hsl: ReturnType<typeof rgbToHsl>) {
  const lum = relativeLuminance(parsed);
  let newL = hsl.l;
  let newAlpha = parsed.a;
  if (isBorderKey(key) && parsed.a < 0.5) return LIGHT_BORDER_STRONG;
  if (isSurfaceKey(key) && parsed.a > 0 && parsed.a < 0.4) {
    const rgb = hslToRgb({ h: hsl.h, s: Math.min(0.74, hsl.s), l: 0.94 });
    return toCss({ ...rgb, a: 1 });
  }
  if (lum > 0.5) newL = 0.42;
  if (parsed.a > 0 && parsed.a < 0.4) newAlpha = Math.min(0.18, parsed.a * 1.5);
  if (Math.abs(newL - hsl.l) < 0.001 && Math.abs(newAlpha - parsed.a) < 0.001) return c;
  const rgb = hslToRgb({ h: hsl.h, s: hsl.s, l: newL });
  return toCss({ ...rgb, a: newAlpha });
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

function exactLightColor(c: string, key: string) {
  if (c === "#FFFFFF") {
    if (isSurfaceKey(key)) return LIGHT_SURFACE;
    if (isBorderKey(key)) return LIGHT_BORDER;
  }
  return EXACT_LIGHT_COLORS[c];
}

function parseColor(c: string): RGBA | null {
  if (c.startsWith("#")) return parseHex(c);
  if (c.startsWith("rgb")) return parseRgb(c);
  return null;
}

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
