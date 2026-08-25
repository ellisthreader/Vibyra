// The notification contract. This file is the bottom of the dependency graph:
// it imports nothing, so the store, the sound engine, the UI, and the settings
// types can all depend on it without creating a cycle. Precedent for a domain
// type file outside `types.ts` is `previewTypes.ts`.

export type NotificationCategory =
  | "agentAttention"
  | "agentDone"
  | "agentFailed"
  | "performance"
  | "preview"
  | "aiSpend"
  | "models"
  | "system";

export type NotificationSeverity = "info" | "success" | "warning" | "danger";

export type SoundCueId = "none" | "chime" | "done" | "ask" | "fail" | "alert" | "blip";

/** Where a category is allowed to surface. */
export type NotificationChannel = "off" | "app" | "system";

/** Actions are identifiers, not closures: the store must not hold references
 * into React or into other stores. `notificationActions.ts` maps them to work. */
export type NotificationActionId =
  | "focusSession"
  | "hibernateIdleTerminals"
  | "enableAcceleratedGraphics"
  | "revertToAutoGraphics"
  | "openGraphicsSettings"
  | "openAiSettings"
  | "openShortcutSettings"
  | "openModelPicker"
  | "openPreview";

export interface NotificationAction {
  id: NotificationActionId;
  label: string;
  /** Session id, project id, or a path — interpreted by the action handler. */
  arg?: string | number;
}

export interface NotificationInput {
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body?: string;
  /** Repeats within the coalesce window collapse onto the existing item. */
  dedupeKey?: string;
  action?: NotificationAction;
  /** Overrides the category's configured cue. */
  cue?: SoundCueId;
  /** false = never escalate to the operating system, whatever the preferences. */
  osEligible?: boolean;
  /** Milliseconds; 0 is sticky. Omitted means "derive from severity". */
  timeoutMs?: number;
}

export interface NotificationItem extends NotificationInput {
  id: number;
  /** Time of the most recent occurrence, refreshed by coalescing. */
  at: number;
  /** 1, or N after repeats collapsed onto this item. */
  count: number;
  read: boolean;
}

export interface NotificationCategoryPrefs {
  channel: NotificationChannel;
  cue: SoundCueId;
}

export interface NotificationPrefs {
  enabled: boolean;
  soundEnabled: boolean;
  /** 0..1. */
  volume: number;
  osEnabled: boolean;
  osOnlyWhenAway: boolean;
  /** "Tell me when a long-running agent goes quiet" — off by default. */
  agentIdleEnabled: boolean;
  categories: Record<NotificationCategory, NotificationCategoryPrefs>;
}
