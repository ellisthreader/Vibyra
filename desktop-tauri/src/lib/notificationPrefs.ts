import type {
  NotificationCategory,
  NotificationCategoryPrefs,
  NotificationChannel,
  NotificationPrefs,
  SoundCueId,
} from "../notificationTypes";

// Defensive normalisation for the one nested object in `Settings`. Kept pure so
// the identity guarantee below is testable without React or the settings store.

const CHANNELS: readonly NotificationChannel[] = ["off", "app", "system"];
const CUES: readonly SoundCueId[] = ["none", "chime", "done", "ask", "fail", "alert", "blip"];

/** Mirrors `NotificationPrefs::default()` in the Rust core. Keep the two in step. */
export const DEFAULT_CATEGORIES: Record<NotificationCategory, NotificationCategoryPrefs> = {
  agentAttention: { channel: "system", cue: "ask" },
  agentDone: { channel: "system", cue: "done" },
  agentFailed: { channel: "system", cue: "fail" },
  aiSpend: { channel: "system", cue: "alert" },
  preview: { channel: "app", cue: "none" },
  models: { channel: "app", cue: "none" },
  performance: { channel: "app", cue: "none" },
  system: { channel: "app", cue: "fail" },
};

export const DEFAULT_NOTIFICATIONS: NotificationPrefs = Object.freeze({
  enabled: true,
  soundEnabled: true,
  volume: 0.5,
  osEnabled: true,
  osOnlyWhenAway: true,
  agentIdleEnabled: false,
  categories: DEFAULT_CATEGORIES,
});

function clampVolume(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return DEFAULT_NOTIFICATIONS.volume;
  return Math.min(1, Math.max(0, value));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function categoryPrefs(value: unknown, fallback: NotificationCategoryPrefs): NotificationCategoryPrefs {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<NotificationCategoryPrefs>;
  return {
    channel: CHANNELS.includes(raw.channel as NotificationChannel)
      ? (raw.channel as NotificationChannel)
      : fallback.channel,
    cue: CUES.includes(raw.cue as SoundCueId) ? (raw.cue as SoundCueId) : fallback.cue,
  };
}

/**
 * Fills a persisted (or absent, or hand-edited) preferences blob out to a
 * complete one.
 *
 * A missing value returns `DEFAULT_NOTIFICATIONS` **by identity**, every time.
 * That matters: this object is read through a zustand selector, and returning a
 * freshly built default on each snapshot would loop `useSyncExternalStore` —
 * the same trap `NO_PROJECTS` guards against in `settingsStore.ts`.
 *
 * Unknown category keys are preserved rather than dropped, so a settings file
 * written by a newer build survives a round-trip through an older one.
 */
export function normalizeNotifications(value: unknown): NotificationPrefs {
  if (!value || typeof value !== "object") return DEFAULT_NOTIFICATIONS;
  const raw = value as Partial<NotificationPrefs> & { categories?: unknown };
  const source = (raw.categories && typeof raw.categories === "object" ? raw.categories : {}) as
    Record<string, unknown>;
  const categories: Record<string, NotificationCategoryPrefs> = { ...source } as Record<
    string,
    NotificationCategoryPrefs
  >;
  for (const [id, fallback] of Object.entries(DEFAULT_CATEGORIES)) {
    categories[id] = categoryPrefs(source[id], fallback);
  }
  return {
    enabled: bool(raw.enabled, DEFAULT_NOTIFICATIONS.enabled),
    soundEnabled: bool(raw.soundEnabled, DEFAULT_NOTIFICATIONS.soundEnabled),
    volume: clampVolume(raw.volume),
    osEnabled: bool(raw.osEnabled, DEFAULT_NOTIFICATIONS.osEnabled),
    osOnlyWhenAway: bool(raw.osOnlyWhenAway, DEFAULT_NOTIFICATIONS.osOnlyWhenAway),
    agentIdleEnabled: bool(raw.agentIdleEnabled, DEFAULT_NOTIFICATIONS.agentIdleEnabled),
    categories: categories as Record<NotificationCategory, NotificationCategoryPrefs>,
  };
}
