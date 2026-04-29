import { NativeModules } from "react-native";
import { DESKTOP_RELAY_URL } from "../data/appData";

export function normalizeAgentUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("http://") || trimmed.startsWith("https://")
    ? trimmed
    : `http://${trimmed}`;
}

export function getExpoHost() {
  const scriptUrl = NativeModules.SourceCode?.scriptURL as string | undefined;
  const hostMatch = scriptUrl?.match(/^[a-z][a-z0-9+.-]*:\/\/([^/:]+)/i);
  return hostMatch?.[1] ?? "";
}

export function getDefaultAgentUrl() {
  if (process.env.EXPO_PUBLIC_DESKTOP_URL) {
    return normalizeAgentUrl(process.env.EXPO_PUBLIC_DESKTOP_URL);
  }

  const host = getExpoHost();
  return host ? `http://${host}:4317` : "http://127.0.0.1:4317";
}

export function getDesktopCandidates(seedUrl: string) {
  const expoHost = getExpoHost();
  const urls = uniqueValues([
    normalizeAgentUrl(process.env.EXPO_PUBLIC_DESKTOP_URL ?? ""),
    DESKTOP_RELAY_URL,
    normalizeAgentUrl(seedUrl),
    expoHost ? `http://${expoHost}:4317` : "",
    "http://127.0.0.1:4317"
  ]);

  const subnetMatch = expoHost.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (subnetMatch) {
    for (let host = 1; host <= 254; host += 1) {
      urls.push(`http://${subnetMatch[1]}.${host}:4317`);
    }
  }

  return uniqueValues(urls);
}

export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
