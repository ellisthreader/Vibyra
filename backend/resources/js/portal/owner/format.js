const number = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function formatCount(value) {
  if (value === null || value === undefined) return "—";
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  return safe >= 100000 ? compact.format(safe) : number.format(safe);
}

export function formatMoney(microUsd) {
  if (microUsd === null || microUsd === undefined) return "—";
  const value = Number(microUsd || 0) / 1000000;
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 2,
  }).format(value);
}

export function formatDay(value) {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? String(value) : new Intl.DateTimeFormat("en", {
    month: "short", day: "numeric", timeZone: "UTC",
  }).format(date);
}

export function readableEvent(value) {
  return String(value || "").replace(/^(desktop|mobile)_/, "").replace(/_/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function readableDimension(value) {
  const names = {
    macos: "macOS", "macos-arm64": "macOS · Apple Silicon", "macos-x64": "macOS · Intel",
    ios: "iOS", android: "Android", web: "Web", windows: "Windows", linux: "Linux",
    "linux-deb": "Linux · Debian", openai: "OpenAI", anthropic: "Anthropic", google: "Google",
  };
  return names[value] ?? readableEvent(value);
}
