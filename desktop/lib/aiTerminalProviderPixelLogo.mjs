const RESET = "\x1b[0m";
const DEFAULT_MAX_WIDTH = 60;
const MAX_OUTPUT_WIDTH = 96;
const MAX_OUTPUT_PIXEL_HEIGHT = 42;
const MAX_SOURCE_DIMENSION = 512;

let generatedProviderLogos = {};
let decodeGeneratedProviderLogo = () => null;

try {
  const generated = await import("../assets/provider-logos/generated.mjs");
  generatedProviderLogos = generated.PROVIDER_LOGO_RGBA
    || generated.PROVIDER_PIXEL_LOGOS
    || {};
  if (typeof generated.decodeProviderPixelLogo === "function") {
    decodeGeneratedProviderLogo = generated.decodeProviderPixelLogo;
  }
} catch (error) {
  const missingGeneratedModule = error?.code === "ERR_MODULE_NOT_FOUND"
    && String(error.message).includes("provider-logos/generated.mjs");
  if (!missingGeneratedModule) throw error;
}

export function renderProviderPixelLogo(logoId, options = {}) {
  const key = providerKey(logoId);
  const logos = options.logos || generatedProviderLogos;
  const storedAsset = findLogo(logos, key);
  const asset = validAsset(storedAsset)
    ? storedAsset
    : logos === generatedProviderLogos
      ? decodeGeneratedProviderLogo(key)
      : storedAsset;
  const fallbackKey = providerKey(options.fallbackLabel || key);
  return renderRgbaPixelLogo(
    validAsset(asset) ? asset : fallbackLogo(fallbackKey),
    options.color !== false,
    options
  );
}

export function renderRgbaPixelLogo(asset, color = true, options = {}) {
  const source = validAsset(asset) ? asset : fallbackLogo("unknown");
  const maxWidth = boundedInteger(
    options.maxWidth ?? options.width,
    DEFAULT_MAX_WIDTH,
    1,
    MAX_OUTPUT_WIDTH
  );
  const scale = Math.min(
    maxWidth / source.width,
    MAX_OUTPUT_PIXEL_HEIGHT / source.height
  );
  const width = Math.max(1, Math.floor(source.width * scale));
  const height = Math.max(1, Math.floor(source.height * scale));
  const rows = [];

  for (let y = 0; y < height; y += 2) {
    let line = "";
    for (let x = 0; x < width; x += 1) {
      const top = sample(source, x, y, width, height);
      const bottom = y + 1 < height
        ? sample(source, x, y + 1, width, height)
        : TRANSPARENT;
      line += renderCell(top, bottom, color);
    }
    rows.push(line);
  }

  return rows;
}

function renderCell(top, bottom, color) {
  const topVisible = top[3] > 0;
  const bottomVisible = bottom[3] > 0;
  if (!topVisible && !bottomVisible) return " ";
  if (!color) {
    if (topVisible && bottomVisible) return "█";
    return topVisible ? "▀" : "▄";
  }
  if (topVisible && bottomVisible && sameRgb(top, bottom)) {
    return `${foreground(top)}█${RESET}`;
  }
  if (topVisible && bottomVisible) {
    return `${foreground(top)}${background(bottom)}▀${RESET}`;
  }
  const pixel = topVisible ? top : bottom;
  return `${foreground(pixel)}${topVisible ? "▀" : "▄"}${RESET}`;
}

function sample(asset, x, y, targetWidth, targetHeight) {
  const sourceX = Math.min(
    asset.width - 1,
    Math.floor(((x + 0.5) * asset.width) / targetWidth)
  );
  const sourceY = Math.min(
    asset.height - 1,
    Math.floor(((y + 0.5) * asset.height) / targetHeight)
  );
  const offset = (sourceY * asset.width + sourceX) * 4;
  return [
    asset.rgba[offset],
    asset.rgba[offset + 1],
    asset.rgba[offset + 2],
    asset.rgba[offset + 3]
  ];
}

function validAsset(asset) {
  if (!asset || !Number.isInteger(asset.width) || !Number.isInteger(asset.height)) return false;
  if (asset.width < 1 || asset.height < 1) return false;
  if (asset.width > MAX_SOURCE_DIMENSION || asset.height > MAX_SOURCE_DIMENSION) return false;
  if (!Array.isArray(asset.rgba) && !ArrayBuffer.isView(asset.rgba)) return false;
  if (asset.rgba.length !== asset.width * asset.height * 4) return false;
  return Array.from(asset.rgba).every((value) => Number.isInteger(value) && value >= 0 && value <= 255);
}

function findLogo(logos, key) {
  if (!logos || typeof logos !== "object") return undefined;
  return logos[key] || logos[key.replace(/-/g, "")];
}

function providerKey(provider) {
  const value = typeof provider === "object"
    ? provider?.provider || provider?.theme?.id || provider?.prompt || provider?.name
    : provider;
  return String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function fallbackLogo(key) {
  const hash = stableHash(key);
  const palette = [
    [139, 92, 255],
    [45, 190, 180],
    [238, 116, 82],
    [90, 145, 255],
    [218, 91, 183]
  ];
  const color = palette[hash % palette.length];
  const width = 8;
  const height = 8;
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width / 2; x += 1) {
      const bit = (hash >>> ((x + y * 4) % 32)) & 1;
      if (!bit && y !== 0 && y !== height - 1) continue;
      setPixel(rgba, width, x, y, color);
      setPixel(rgba, width, width - x - 1, y, color);
    }
  }
  return { width, height, rgba };
}

function setPixel(rgba, width, x, y, color) {
  const offset = (y * width + x) * 4;
  rgba.set([...color, 255], offset);
}

function foreground([red, green, blue]) {
  return `\x1b[38;2;${red};${green};${blue}m`;
}

function background([red, green, blue]) {
  return `\x1b[48;2;${red};${green};${blue}m`;
}

function sameRgb(left, right) {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(number)));
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

const TRANSPARENT = Object.freeze([0, 0, 0, 0]);
