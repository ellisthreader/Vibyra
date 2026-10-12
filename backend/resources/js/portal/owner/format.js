const number = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function formatExactCount(value) {
  const safe = numeric(value);
  return safe == null ? "—" : number.format(safe);
}

export function formatCount(value) {
  const safe = numeric(value);
  if (safe == null) return "—";
  return safe >= 100000 ? compact.format(safe) : number.format(safe);
}

export function formatMoney(microUsd) {
  const amount = numeric(microUsd);
  if (amount == null) return "—";
  const value = amount / 1000000;
  if (value > 0 && value < 0.01) return "< $0.01";
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
    "/": "Homepage", "/downloads": "Downloads", "/signup": "Sign up", "/login": "Log in",
    "/account": "Account", "/checkout": "Checkout", "/benchmarks": "Benchmarks",
    nav_downloads: "Navigation · Get Vibyra", GB: "United Kingdom", "GB-LND": "London, UK",
  };
  if (names[value]) return names[value];
  if (String(value).includes("/") && !String(value).startsWith("/")) {
    const [provider, model] = String(value).split("/");
    return (names[provider] || provider) + " · " + model.replace(/-/g, " ");
  }
  return readableEvent(value);
}
import { numeric } from "./ownerData.js";
