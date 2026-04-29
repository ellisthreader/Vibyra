import { networkInterfaces, hostname } from "node:os";

export const PORT = Number(process.env.VIBYRA_AGENT_PORT ?? 4317);
export const PAIR_CODE = process.env.VIBYRA_PAIR_CODE ?? makePairCode();
export const TOKEN = process.env.VIBYRA_AGENT_TOKEN ?? `vibyra-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const machineName = hostname();
export const startedAt = new Date().toISOString();
export const allowedCommands = new Set(["git status", "npm install", "npm run dev", "npm run build", "npm test", "pytest"]);

export const appState = {
  server: null,
  pairedDevice: null,
  pendingPair: null,
  selectedProjectId: null,
  latestPreview: null,
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

export function event(source, message, tone = "info") {
  return {
    id: `evt-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    source,
    message,
    tone,
    time: "Now"
  };
}

export function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
}

export function connectionUrls() {
  return lanAddresses().map((address) => `http://${address}:${PORT}`);
}

export function publicState() {
  return {
    machineName,
    pairCode: PAIR_CODE,
    pairedDevice: appState.pairedDevice,
    pendingPair: appState.pendingPair,
    latestPreview: appState.latestPreview,
    events: appState.events,
    connectionUrls: connectionUrls(),
    projects: appState.cachedProjects
  };
}

export function pushEvents(events) {
  appState.events = [...events, ...appState.events].slice(0, 50);
}
