// What the updater says to the user, as pure functions. The store decides
// *when* to announce; this file decides whether there is anything worth
// announcing and what it reads like. Kept free of Tauri and zustand so the
// escalation path is a unit test rather than a release-day surprise.

import type { NotificationInput } from "../notificationTypes";

/**
 * The watcher re-checks every few minutes and the feed keeps answering with the
 * same release until the user restarts, so "found an update" is not by itself
 * news. Only a version that has not been announced in this session is.
 *
 * Deliberately not a semver comparison: the backend has already decided this
 * build is newer, and a client-side opinion about ordering would only add a way
 * for a legitimate release to go unannounced.
 */
export function shouldAnnounce(announced: string, version: string): boolean {
  return version !== "" && version !== announced;
}

/** Release notes are author-written and unbounded; a toast body has room for a
 * sentence. Anything longer is left to the banner, which has the full string. */
const MAX_NOTE_LENGTH = 120;

function firstLine(notes: string): string {
  return notes.trim().split("\n")[0].trim();
}

/**
 * The notification raised the moment a release appears.
 *
 * `success`, not `info`: `shouldEscalate` refuses to escalate info, and this is
 * the one notice that must be able to reach the desktop when the window is in
 * the background — that is the whole point of noticing a release live.
 *
 * The action installs rather than opening anything. There is no screen to send
 * the user to: the banner and the title-bar chip are both already on screen,
 * and a notification whose button just reveals another button is a dead end.
 */
export function updateNotice(version: string, notes = ""): NotificationInput {
  const note = firstLine(notes);
  return {
    category: "appUpdate",
    severity: "success",
    title: `Vibyra ${version} is available`,
    body: note && note.length <= MAX_NOTE_LENGTH
      ? note
      : "Click Update to download it. Vibyra restarts when you say so.",
    // One key per version: a second sighting of the same release collapses onto
    // the first rather than stacking a fresh toast every poll.
    dedupeKey: `appUpdate:${version}`,
    action: { id: "installUpdate", label: "Update" },
    // Sticky. An update the user blinked past is the exact complaint this
    // whole path exists to fix.
    timeoutMs: 0,
    // The banner is this release's surface in the window and it tracks the
    // live status, so a toast saying the same thing only stacks a second card
    // over it — with "available" and "ready" both sticky, three cards ended up
    // overlapping in the corner. This still reaches the bell and the OS.
    toast: false,
  };
}

/** The notice raised once the package is on disk and only a restart is left. */
export function updateReadyNotice(version: string): NotificationInput {
  return {
    category: "appUpdate",
    severity: "success",
    title: `Vibyra ${version} is ready`,
    body: "Restart to finish installing — open terminals will close.",
    dedupeKey: `appUpdateReady:${version}`,
    action: { id: "installUpdate", label: "Restart now" },
    timeoutMs: 0,
    toast: false,
  };
}
