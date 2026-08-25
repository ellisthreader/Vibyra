import type { NotificationInput, NotificationTier } from "../notificationTypes";
import { bannerCopy, type UpdateProgress, type UpdateStatus } from "./updatePolicy.ts";

// The updater as a notification rather than a surface of its own.
//
// `UpdateBanner` used to be a second, parallel notification system: its own
// store, its own copy, its own dismissal, its own progress bar — and no
// history, no preferences and no desktop channel, because none of that reaches
// a bespoke component. Routing it through the store gets all four for free.
//
// The copy is not rewritten here. `bannerCopy` already says these six things
// well and is covered by `updatePolicy.test.mjs`; this module only decides what
// each state *wants from the user*, which is the tier.

/** One card from "available" to "restart", so the states replace each other in
 * place instead of stacking six deep over a two-minute download. */
const REPLACE_KEY = "update";

const TIERS: Record<UpdateStatus, NotificationTier | null> = {
  idle: null,
  // News, never a warning: nothing is wrong, and an update that shouts is an
  // update people learn to dismiss unread.
  available: "news",
  downloading: "busy",
  // The whole reason `ask` exists as a tier. Restarting under a running agent
  // loses work, so this can only ever be the user's call — it must not time
  // out, must not be red, and must sit above everything else.
  ready: "ask",
  installing: "busy",
  error: "fail",
  restartError: "fail",
};

/** Perched above the workspace rather than in the corner: an update is worth a
 * standing offer, and a failure is worth dismissing. */
const PINNED: UpdateStatus[] = ["available", "downloading", "ready", "installing"];

const ACTIONS: Partial<Record<UpdateStatus, "downloadUpdate" | "restartForUpdate">> = {
  available: "downloadUpdate",
  downloading: "downloadUpdate",
  error: "downloadUpdate",
  ready: "restartForUpdate",
  installing: "restartForUpdate",
  restartError: "restartForUpdate",
};

export interface UpdateState {
  status: UpdateStatus;
  version: string;
  progress: UpdateProgress;
  error: string | null;
  notes: string;
}

/**
 * The notice for an updater state, or null when there is nothing to say.
 *
 * A `busy` notice carries a percentage only when the server announced a
 * content length; otherwise `progress` is omitted and the card draws the
 * indeterminate bar rather than a bar pinned at zero.
 */
export function updateNotification(state: UpdateState): NotificationInput | null {
  const tier = TIERS[state.status];
  if (!tier || !state.version) return null;
  const copy = bannerCopy(state.status, state.version, state.progress, state.error, state.notes);
  const action = ACTIONS[state.status];
  const determinate = state.status === "downloading" && state.progress.total > 0;

  return {
    kind: "update",
    tier,
    title: copy.title,
    body: copy.detail,
    replaceKey: REPLACE_KEY,
    pinned: PINNED.includes(state.status),
    progress: determinate ? state.progress.percent : undefined,
    // `busy` never escalates anyway; saying so here keeps the intent local.
    osEligible: tier !== "busy",
    ...(action && !copy.busy ? { action: { id: action, label: copy.action } } : {}),
  };
}

/**
 * What a state is worth telling the store about.
 *
 * The download callback fires per chunk, which is far more often than the card
 * changes: without this the store would take a write per chunk and the bar
 * would animate to the same width repeatedly. Whole percents are the finest
 * granularity a 2px bar can show.
 */
export function updateSignature(state: UpdateState): string {
  const percent = state.status === "downloading" ? state.progress.percent : 0;
  return `${state.status}:${state.version}:${percent}:${state.error ?? ""}`;
}
