import { create } from "zustand";

import { shouldOpen } from "../lib/changelog";

/**
 * Opens the What's New window once per upgrade.
 *
 * The version last shown is remembered per install rather than per account: it
 * answers "has this copy of Vibyra already told you about this build", which is
 * a property of the machine, not of who is signed in.
 */
const SEEN_KEY = "vibyra.whatsNew.seen";

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Private windows and hardened webviews throw on access rather than
    // returning null. A changelog is never worth an exception.
    return null;
  }
}

function read(): string | null {
  try {
    return store()?.getItem(SEEN_KEY) ?? null;
  } catch {
    return null;
  }
}

function write(version: string): void {
  try {
    store()?.setItem(SEEN_KEY, version);
  } catch {
    // Nothing to do: the window simply opens again next upgrade.
  }
}

interface WhatsNewStore {
  /** The version the window is showing, or "" when it is closed. */
  showing: string;
  /** Called once the running version is known. */
  arrived: (version: string) => void;
  /** Opened deliberately, from Settings or the bell — always shows. */
  open: (version: string) => void;
  close: () => void;
}

export const useWhatsNewStore = create<WhatsNewStore>((set) => ({
  showing: "",

  arrived: (version) => {
    if (version === "") return;
    const seen = read();
    // Recorded whether or not it opens, so a build with no written entry still
    // counts as seen and does not re-arm the next launch.
    write(version);
    if (shouldOpen(version, seen)) set({ showing: version });
  },

  open: (version) => set({ showing: version }),
  close: () => set({ showing: "" }),
}));
