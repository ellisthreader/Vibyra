import type { AccountProfile } from "../types";

export const FIRST_WELCOME_STORAGE_KEY = "vibyra.desktop.firstWelcomeSeenAccounts";
export const FIRST_WELCOME_BEAT_MS = 1_600;
export const FIRST_WELCOME_DURATION_MS = 6_400;

export interface WelcomeBeat {
  eyebrow: string;
  title: string;
  body: string;
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
    {
      eyebrow: `Made for ${firstName}`,
      title: `Welcome to Vibyra, ${firstName}.`,
      body: "Your AI workspace is ready on this computer.",
    },
    {
      eyebrow: "Begin with what matters",
      title: "Choose the work.",
      body: "Open a project, describe the outcome, and keep the work grounded in your files.",
    },
    {
      eyebrow: "Set the shape",
      title: "One focused agent. Or a coordinated team.",
      body: "Move quickly on one task, or let Vibyra divide a bigger goal with clear ownership.",
    },
    {
      eyebrow: "Stay in the loop",
      title: "Build here. Review anywhere.",
      body: "Follow live work, approve changes, and check progress from this desktop or your phone.",
    },
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
