import * as Network from "expo-network";
import { NativeModules, Platform } from "react-native";
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

export async function getDesktopCandidates(seedUrl: string) {
  const expoHost = getExpoHost();
  const seedHost = getUrlHost(seedUrl);
  const deviceHost = await getDeviceIpAddress();
  const hosts = uniqueValues([deviceHost, expoHost, seedHost].filter(isIpv4Address));
  const urls = uniqueValues([
    normalizeAgentUrl(process.env.EXPO_PUBLIC_DESKTOP_URL ?? ""),
    normalizeAgentUrl(seedUrl),
    expoHost ? `http://${expoHost}:4317` : "",
    seedHost ? `http://${seedHost}:4317` : "",
    DESKTOP_RELAY_URL,
    Platform.OS === "web" ? "http://127.0.0.1:4317" : ""
  ]);

  hosts.forEach((hostAddress) => {
    const subnetMatch = hostAddress.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})$/);
    if (!subnetMatch) return;

    const subnet = subnetMatch[1];
    const currentHost = Number(subnetMatch[2]);
    const prioritizedHosts = uniqueValues([
      String(currentHost),
      ...nearbyHosts(currentHost, 28).map(String),
      "1",
      "2",
      "10",
      "20",
      "25",
      "30",
      "50",
      "75",
      "100",
      "101",
      "123",
      "150",
      "175",
      "200",
      ...Array.from({ length: 254 }, (_, index) => String(index + 1))
    ]);

    for (const host of prioritizedHosts) {
      urls.push(`http://${subnet}.${host}:4317`);
    }
  });

  return uniqueValues(urls);
}

export function appendDesktopCandidates(candidates: string[], urls: string[] = []) {
  const normalized = urls.map(normalizeAgentUrl);
  return uniqueValues([...normalized, ...candidates]);
}

export class TimeoutError extends Error {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message);
    this.name = "TimeoutError";
  }
}

export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      const seconds = Math.max(1, Math.round(timeoutMs / 1000));
      reject(new TimeoutError(`Request timed out after ${seconds}s`, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      fetch(url, { ...options, signal: controller.signal }),
      timeoutPromise
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getUrlHost(value: string) {
  try {
    return new URL(normalizeAgentUrl(value)).hostname;
  } catch {
    return "";
  }
}

function isIpv4Address(value: string) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value);
}

async function getDeviceIpAddress() {
  try {
    const ipAddress = await Network.getIpAddressAsync();
    return isIpv4Address(ipAddress) ? ipAddress : "";
  } catch {
    return "";
  }
}

function nearbyHosts(host: number, radius: number) {
  const nearby: number[] = [];
  for (let offset = 1; offset <= radius; offset += 1) {
    if (host - offset >= 1) nearby.push(host - offset);
    if (host + offset <= 254) nearby.push(host + offset);
  }
  return nearby;
}
