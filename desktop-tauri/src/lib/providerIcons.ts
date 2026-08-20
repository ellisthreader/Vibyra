import { decodeProviderPixelLogo } from "../assets/providerLogos";
import { resolveTheme } from "./xtermTheme";

// Renders the old app's 64×64 checksummed provider marks to data URLs,
// with the old app's colour rules: monochrome marks stay WHITE on dark
// (they were rasterised white for dark terminals), get repainted near-black
// on light; multicolour marks keep their original colours.

const AGENT_TO_PROVIDER: Record<string, string> = {
  claude: "anthropic",
  codex: "openai",
  gemini: "google",
  qwen: "qwen",
  openrouter: "openrouter",
};

const cache = new Map<string, string | null>();

function isMonochromeWhite(rgba: Uint8ClampedArray): boolean {
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] > 8 && (rgba[i] < 235 || rgba[i + 1] < 235 || rgba[i + 2] < 235)) {
      return false;
    }
  }
  return true;
}

function repaint(rgba: Uint8ClampedArray, hex: string): void {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if ([r, g, b].some(Number.isNaN)) return;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] > 0) {
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
    }
  }
}

/** Data URL for a provider key (anthropic, deepseek, xai, …). */
export function iconForProvider(provider: string): string | null {
  const theme = resolveTheme(
    document.documentElement.dataset.theme ?? "dark",
  );
  const key = `${provider}:${theme}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let url: string | null = null;
  try {
    const logo = decodeProviderPixelLogo(provider);
    if (logo) {
      const rgba = new Uint8ClampedArray(logo.rgba);
      // Old-app rule: white marks are made for dark; flip only on light.
      if (theme === "light" && isMonochromeWhite(rgba)) {
        repaint(rgba, "#20232a");
      }
      const canvas = document.createElement("canvas");
      canvas.width = logo.width;
      canvas.height = logo.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.putImageData(new ImageData(rgba, logo.width, logo.height), 0, 0);
        url = canvas.toDataURL("image/png");
      }
    }
  } catch {
    url = null;
  }
  cache.set(key, url);
  return url;
}

/** Data URL of the provider mark for an agent id, or null if we have none. */
export function providerIconFor(agentId: string): string | null {
  const provider = AGENT_TO_PROVIDER[agentId];
  if (!provider) return null;
  return iconForProvider(provider);
}
