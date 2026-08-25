// The notification contract. This file is the bottom of the dependency graph:
// it imports nothing, so the store, the sound engine, the UI, and the settings
// types can all depend on it without creating a cycle. Precedent for a domain
// type file outside `types.ts` is `previewTypes.ts`.
//
// Two axes, deliberately independent. `kind` is what a notice is *about* and
// owns the icon, the chip, the sound and the Settings row. `tier` is what it
// *wants from you* and owns the colour, the lifetime, the stack rank and
// whether the desktop is allowed to hear about it. The rules for each live in
// `lib/notificationTiers.ts`; nothing here decides anything.

/** What a notice is about. Ten domains; outcome is never encoded here. */
export type NotificationKind =
  | "agent"
  | "approval"
  | "update"
  | "account"
  | "spend"
  | "performance"
  | "preview"
  | "models"
  | "project"
  | "app";

/**
 * What a notice wants from you.
 *
 * Replaces the old four-value severity, which could not express either of the
 * two states that matter most: a decision is pending (`ask`), and work is
 * under way (`busy`).
 */
export type NotificationTier = "ask" | "fail" | "risk" | "busy" | "done" | "news";

export type SoundCueId = "none" | "chime" | "done" | "ask" | "fail" | "alert" | "blip";

/** Where a kind is allowed to surface. */
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
  | "openPreview"
  | "downloadUpdate"
  | "restartForUpdate"
  | "openUpdateSettings";

export interface NotificationAction {
  id: NotificationActionId;
  label: string;
  /** Session id, project id, or a path — interpreted by the action handler. */
  arg?: string | number;
}

/**
 * How an agent's own prompt option reads to a human.
 *
 * `remember` is the CLI's own "don't ask again" choice. It is parsed so the
 * toast can recognise and skip it: Vibyra deliberately keeps no second
 * permission list beside the agent's, because it cannot reproduce the scope
 * the agent computed for that rule.
 */
export type AgentPromptIntent = "affirm" | "decline" | "remember" | "other";

export interface AgentPromptOption {
  /** The literal keystroke the agent is waiting for, e.g. "1" or "y". */
  key: string;
  /**
   * Whether that keystroke needs a trailing Enter.
   *
   * False for the numbered lists a TUI draws, which act on the keypress: an
   * Enter behind one lands in the composer that replaces the prompt, and would
   * submit whatever the user had half-typed there. True only for the bare
   * "[y/n]" of a line-oriented `read`, which does nothing until Enter.
   */
  submit: boolean;
  /** The option as the agent wrote it, minus its key hint. */
  label: string;
  intent: AgentPromptIntent;
}

/** A prompt Vibyra read off a pane, and the offer to answer it from a toast. */
export interface AgentPromptOffer {
  sessionId: number;
  /** The question line, as the agent wrote it. */
  question: string;
  /** The command block under the question, one entry per logical line. */
  detail: string[];
  options: AgentPromptOption[];
  /**
   * Digest of the parsed block. Re-read and compared before any keystroke is
   * sent: once the screen has moved on, option 1 no longer means what it did
   * when the toast was drawn, and answering it blind would answer a different
   * question.
   */
  fingerprint: string;
}

export interface NotificationInput {
  kind: NotificationKind;
  tier: NotificationTier;
  title: string;
  body?: string;
  /** Repeats within the coalesce window collapse onto the existing item. */
  dedupeKey?: string;
  /**
   * Supersedes any notice already carrying this key, however old.
   *
   * Different from `dedupeKey`, which collapses *repeats of the same event*
   * inside a few seconds and counts them. This replaces one notice with the
   * next state of the same ongoing thing — a download at 12% becoming the same
   * download at 48%, then "restart to finish" — so a long-running job occupies
   * exactly one card from beginning to end instead of a column of stale ones.
   */
  replaceKey?: string;
  action?: NotificationAction;
  /** Overrides the kind's configured cue. */
  cue?: SoundCueId;
  /** false = never escalate to the operating system, whatever the preferences. */
  osEligible?: boolean;
  /** Milliseconds; 0 is sticky. Omitted means "derive from the tier". */
  timeoutMs?: number;
  /** Set when the notice was raised by a prompt Vibyra could actually read. */
  prompt?: AgentPromptOffer;
  /**
   * 0..100 for a `busy` notice, omitted for one whose length is unknown —
   * which draws the indeterminate bar. Ignored on every other tier.
   */
  progress?: number;
  /**
   * Draws in the banner slot above the workspace rather than in the corner
   * stack, and never times out. For the one notice at a time that deserves a
   * perch: an update waiting to be taken.
   */
  pinned?: boolean;
}

export interface NotificationItem extends NotificationInput {
  id: number;
  /** Time of the most recent occurrence, refreshed by coalescing. */
  at: number;
  /** 1, or N after repeats collapsed onto this item. */
  count: number;
  read: boolean;
}

export interface NotificationKindPrefs {
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
  kinds: Record<NotificationKind, NotificationKindPrefs>;
}
