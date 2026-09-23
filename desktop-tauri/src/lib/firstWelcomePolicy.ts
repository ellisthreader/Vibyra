import type { AccountProfile } from "../types";

export const FIRST_WELCOME_STORAGE_KEY = "vibyra.desktop.firstWelcomeSeenAccounts";

export const WELCOME_DURATIONS = [2_000, 8_200, 8_200, 13_000, 1_500] as const;

export interface WelcomeBeat {
  label: string;
  title: string;
  body: string;
  note?: string;
}

interface WelcomeStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

const seenThisSession = new Set<string>();

function browserStorage(): WelcomeStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function storedKeys(storage: WelcomeStorage | null): string[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(FIRST_WELCOME_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function welcomeFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}

export function firstWelcomeBeats(name: string): WelcomeBeat[] {
  const firstName = welcomeFirstName(name);
  return [
    { label: "Welcome", title: `Welcome to Vibyra, ${firstName}.`,
      body: "" },
    { label: "Code", title: "Build with your coding agents.",
      body: "Create a project or open a folder. Run coding agents side by side in your terminal workspace." },
    { label: "Agents", title: "A teammate for each task.",
      body: "Choose a role, tools and instructions. Give each agent a focused job and a conversation of its own." },
    { label: "iPhone & Remote", title: "Take your workspace with you.",
      body: "Open Vibyra on your iPhone, find this computer and approve the connection here. Vibyra Cloud connects you across networks.",
      note: "Enable remote phone control in Settings → Phone." },
    { label: "Start", title: "Let’s build.",
      body: "" },
  ];
}

export function hasSeenFirstWelcome(
  profile: AccountProfile | null,
  storage: WelcomeStorage | null = browserStorage(),
): boolean {
  const key = profile?.welcomeKey?.trim();
  if (!key) return true;
  return seenThisSession.has(key) || storedKeys(storage).includes(key);
}

export function rememberFirstWelcome(
  profile: AccountProfile,
  storage: WelcomeStorage | null = browserStorage(),
): void {
  const key = profile.welcomeKey.trim();
  if (!key) return;
  seenThisSession.add(key);
  if (!storage) return;
  try {
    const previous = storedKeys(storage).filter((value) => value !== key);
    storage.setItem(FIRST_WELCOME_STORAGE_KEY, JSON.stringify([...previous, key].slice(-50)));
  } catch {
    // Session memory still prevents duplicate playback while storage is unavailable.
  }
}
