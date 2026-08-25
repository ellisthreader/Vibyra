import type {
  NotificationChannel,
  NotificationKind,
  NotificationKindPrefs,
  NotificationPrefs,
  SoundCueId,
} from "../notificationTypes";

// Defensive normalisation for the one nested object in `Settings`. Kept pure so
// the identity guarantee below is testable without React or the settings store.

const CHANNELS: readonly NotificationChannel[] = ["off", "app", "system"];
const CUES: readonly SoundCueId[] = ["none", "chime", "done", "ask", "fail", "alert", "blip"];

/** Mirrors `NotificationPrefs::default()` in the Rust core. Keep the two in step. */
export const DEFAULT_KINDS: Record<NotificationKind, NotificationKindPrefs> = {
  approval: { channel: "system", cue: "ask" },
  agent: { channel: "system", cue: "done" },
  update: { channel: "system", cue: "chime" },
  account: { channel: "system", cue: "alert" },
  spend: { channel: "system", cue: "alert" },
  preview: { channel: "app", cue: "none" },
  performance: { channel: "app", cue: "none" },
  project: { channel: "app", cue: "none" },
  models: { channel: "app", cue: "none" },
  app: { channel: "app", cue: "fail" },
};

/**
 * Where a settings file written before the tier/kind split lands.
 *
 * The three agent categories were outcomes, not domains, so two of them
 * collapse onto `agent` and the third — which was only ever raised for a
 * permission prompt — becomes `approval`. Mirrored in `notifications.rs`;
 * whichever side reads the file first, the result is the same.
 */
const LEGACY_KINDS: [string, NotificationKind][] = [
  ["agentAttention", "approval"],
  ["agentDone", "agent"],
  ["agentFailed", "agent"],
  ["aiSpend", "spend"],
  ["system", "app"],
];

export const DEFAULT_NOTIFICATIONS: NotificationPrefs = Object.freeze({
  enabled: true,
  soundEnabled: true,
  volume: 0.5,
  osEnabled: true,
  osOnlyWhenAway: true,
  agentIdleEnabled: false,
  kinds: DEFAULT_KINDS,
});

function clampVolume(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return DEFAULT_NOTIFICATIONS.volume;
  return Math.min(1, Math.max(0, value));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function kindPrefs(value: unknown, fallback: NotificationKindPrefs): NotificationKindPrefs {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<NotificationKindPrefs>;
  return {
    channel: CHANNELS.includes(raw.channel as NotificationChannel)
      ? (raw.channel as NotificationChannel)
      : fallback.channel,
    cue: CUES.includes(raw.cue as SoundCueId) ? (raw.cue as SoundCueId) : fallback.cue,
  };
}

/** The stored map, under whichever name the file that wrote it used. */
function storedKinds(raw: Record<string, unknown>): Record<string, unknown> {
  const source = raw.kinds ?? raw.categories;
  return source && typeof source === "object" ? (source as Record<string, unknown>) : {};
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
 * A pre-split file is migrated by name, and unknown keys are preserved rather
 * than dropped, so a settings file written by a newer build survives a
 * round-trip through an older one.
 */
export function normalizeNotifications(value: unknown): NotificationPrefs {
  if (!value || typeof value !== "object") return DEFAULT_NOTIFICATIONS;
  const raw = value as Partial<NotificationPrefs> & { categories?: unknown; kinds?: unknown };
  const source = storedKinds(raw as Record<string, unknown>);
  const kinds: Record<string, NotificationKindPrefs> = { ...source } as Record<
    string,
    NotificationKindPrefs
  >;
  for (const [legacy, kind] of LEGACY_KINDS) {
    // First writer wins, so "agentDone" settles `agent` and "agentFailed" only
    // fills it when the file predates that category too.
    if (source[kind] === undefined && source[legacy] !== undefined && kinds[kind] === undefined) {
      kinds[kind] = kindPrefs(source[legacy], DEFAULT_KINDS[kind]);
    }
    delete kinds[legacy];
  }
  for (const [id, fallback] of Object.entries(DEFAULT_KINDS)) {
    kinds[id] = kindPrefs(kinds[id], fallback);
  }
  return {
    enabled: bool(raw.enabled, DEFAULT_NOTIFICATIONS.enabled),
    soundEnabled: bool(raw.soundEnabled, DEFAULT_NOTIFICATIONS.soundEnabled),
    volume: clampVolume(raw.volume),
    osEnabled: bool(raw.osEnabled, DEFAULT_NOTIFICATIONS.osEnabled),
    osOnlyWhenAway: bool(raw.osOnlyWhenAway, DEFAULT_NOTIFICATIONS.osOnlyWhenAway),
    agentIdleEnabled: bool(raw.agentIdleEnabled, DEFAULT_NOTIFICATIONS.agentIdleEnabled),
    kinds: kinds as Record<NotificationKind, NotificationKindPrefs>,
  };
}
