import { networkInterfaces, hostname, homedir } from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { currentAgentRun, listAgentRuns } from "./agentRunState.mjs";

export const PORT = Number(process.env.VIBYRA_AGENT_PORT ?? 4317);
export const PAIR_CODE = process.env.VIBYRA_PAIR_CODE ?? makePairCode();
export const TOKEN = process.env.VIBYRA_AGENT_TOKEN ?? loadDesktopToken();
export const machineName = hostname();
export const startedAt = new Date().toISOString();
export const allowedCommands = new Set(["git status", "npm install", "npm run dev", "npm run build", "npm test", "pytest"]);
export const PHONE_SESSION_TIMEOUT_MS = 30000;

export const appState = {
  server: null,
  desktopAccount: null,
  desktopAccountToken: null,
  pairedDevice: null,
  phoneSession: null,
  pendingPair: null,
  selectedProjectId: null,
  latestPreview: null,
  previewServers: {},
  agentRuns: {},
  pendingAgentApplies: {},
  cachedProjects: [],
  events: [
    event("Desktop", "Vibyra Desktop is ready", "success"),
    event("Pairing", `Pair code ${PAIR_CODE} is showing in Vibyra Desktop`, "info")
  ]
};

export function makePairCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function loadDesktopToken() {
  const tokenPath = join(homedir(), ".vibyra-agent", "desktop-token");
  try {
    if (existsSync(tokenPath)) {
      const existing = readFileSync(tokenPath, "utf8").trim();
      if (existing) return existing;
    }
    const token = `vibyra-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    mkdirSync(join(homedir(), ".vibyra-agent"), { recursive: true });
    writeFileSync(tokenPath, `${token}\n`, { mode: 0o600 });
    return token;
  } catch {
    return `vibyra-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function event(source, message, tone = "info") {
  return {
    id: `evt-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    source,
    message,
    tone,
    time: "Now",
    createdAt: new Date().toISOString()
  };
}

export function lanAddresses() {
  const virtualInterfacePattern = /^(?:lo|docker|br-|veth|virbr|tun|tap|wg|zt|tailscale)/i;
  const addresses = [];

  for (const [name, entries] of Object.entries(networkInterfaces())) {
    if (virtualInterfacePattern.test(name)) continue;
    for (const item of entries ?? []) {
      if (item && item.family === "IPv4" && !item.internal && isPhoneReachableHost(item.address)) addresses.push(item.address);
    }
  }

  return addresses;
}

export function connectionUrls() {
  return lanAddresses().map((address) => `http://${address}:${PORT}`);
}

export function publicHostFromRequestHost(requestHost) {
  const host = hostnameFromRequestHost(requestHost);
  if (isLoopbackHost(host)) return host === "localhost" ? "127.0.0.1" : host;
  return isPhoneReachableHost(host) ? host : lanAddresses()[0] ?? "127.0.0.1";
}

export function markPhoneConnected(deviceName = appState.pairedDevice || approvedPairDeviceName() || "Vibyra Phone") {
  const wasConnected = Boolean(activePairedDevice(false));
  const now = new Date().toISOString();
  appState.pairedDevice = deviceName;
  appState.phoneSession = {
    deviceName,
    connectedAt: appState.phoneSession?.connectedAt ?? now,
    lastSeenAt: now
  };
  if (!wasConnected) {
    pushEvents([event("Pairing", `${deviceName} connected to Vibyra Desktop`, "success")]);
  }
}

export function disconnectPhone(message = "Phone disconnected from Vibyra Desktop") {
  const deviceName = appState.phoneSession?.deviceName || appState.pairedDevice;
  appState.pairedDevice = null;
  appState.phoneSession = null;
  if (appState.pendingPair?.status !== "pending") appState.pendingPair = null;
  pushEvents([event("Pairing", message || `${deviceName || "Phone"} disconnected from Vibyra Desktop`, "warning")]);
}

export function activePairedDevice(emitExpiredEvent = true) {
  if (!appState.phoneSession) return null;
  const lastSeen = Date.parse(appState.phoneSession.lastSeenAt);
  const expired = Number.isFinite(lastSeen) && Date.now() - lastSeen > PHONE_SESSION_TIMEOUT_MS;
  if (!expired) return appState.phoneSession.deviceName || appState.pairedDevice;

  const deviceName = appState.phoneSession.deviceName || appState.pairedDevice || "Phone";
  appState.pairedDevice = null;
  appState.phoneSession = null;
  if (emitExpiredEvent) {
    pushEvents([event("Pairing", `${deviceName} is no longer connected to Vibyra Desktop`, "warning")]);
  }
  return null;
}

export function publicState() {
  const pairedDevice = activePairedDevice();
  return {
    machineName,
    pairCode: PAIR_CODE,
    pairedDevice,
    pendingPair: appState.pendingPair,
    desktopAccount: appState.desktopAccount,
    latestPreview: appState.latestPreview,
    agentRuns: listAgentRuns(appState),
    activeAgentRun: currentAgentRun(appState),
    events: appState.events,
    connectionUrls: connectionUrls(),
    projects: appState.cachedProjects
  };
}

export function pushEvents(events) {
  appState.events = [...events, ...appState.events].slice(0, 50);
}

function approvedPairDeviceName() {
  return appState.pendingPair?.status === "approved" ? appState.pendingPair.deviceName : null;
}

function hostnameFromRequestHost(requestHost) {
  const value = String(requestHost ?? "").trim();
  if (!value) return "";
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `http://${value}`).hostname;
  } catch {
    return value.split(":")[0] ?? "";
  }
}

function isPhoneReachableHost(hostname) {
  const host = String(hostname ?? "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  return Boolean(host)
    && host !== "0.0.0.0"
    && host !== "::"
    && host !== "::1"
    && host !== "localhost"
    && host !== "255.255.255.255"
    && !/^127\./.test(host)
    && !/^169\.254\./.test(host)
    && !/^fe80:/i.test(host);
}

function isLoopbackHost(hostname) {
  const host = String(hostname ?? "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "::1" || /^127\./.test(host);
}
