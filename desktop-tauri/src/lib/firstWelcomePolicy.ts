import type { AccountProfile } from "../types";

export const FIRST_WELCOME_STORAGE_KEY = "vibyra.desktop.firstWelcomeSeenAccounts";

export const WELCOME_DURATIONS = [2_000, 8_200, 8_200, 13_000, 1_500] as const;

export interface WelcomeBeat {
  label: string;
  title: string;
  body: string;
  emphasis?: string;
  shortLabel?: string;
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
    { label: "Code", title: "Your ideas. Your agents.", emphasis: "Your agents.",
      body: "Build with Codex, Claude and Gemini side by side. One project. A workspace that keeps up." },
    { label: "Agents", title: "Good work starts with a great team.", emphasis: "a great team.",
      body: "Give each teammate a role, tools and instructions. Turn a focused conversation into your next step." },
    { label: "iPhone & Remote", shortLabel: "iPhone", title: "Your workspace. Wherever you are.", emphasis: "Wherever you are.",
      body: "Find your computer on iPhone and approve the connection here. Stay connected across networks with Vibyra Cloud.",
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
