import type { Collision } from "./reviewCollisions";
import type { FleetRow } from "./reviewFleet";
import type { NotificationInput } from "../notificationTypes";

// What the Review tool is allowed to interrupt you for, and what it must stay
// quiet about. Pure, so the rules can be pinned by a test rather than
// discovered by being annoyed by them.

function files(count: number): string {
  return count === 1 ? "1 file" : `${count} files`;
}

/**
 * An agent stopped and left something behind.
 *
 * Keyed by pane so a workspace occupies one card as it grows rather than a
 * column of stale ones — the same `replaceKey` idiom the updater uses for a
 * download's progress. `done`, not `ask`: nothing is blocked on you, the work
 * is simply ready whenever you want it.
 */
export function readyNotice(row: FleetRow): NotificationInput | null {
  if (row.status !== "ready" || row.paneId === null) return null;
  return {
    kind: "agent",
    tier: "done",
    title: `${row.title} finished`,
    body: `${files(row.summary.files)} ready to review (+${row.summary.additions} −${row.summary.deletions})`,
    replaceKey: `review:ready:${row.paneId}`,
    action: { id: "focusSession", label: "Review", arg: row.paneId },
  };
}

/**
 * Two workspaces have reached the same lines.
 *
 * Only `overlap` and `conflict` may interrupt. `touch` — the same file edited
 * in different places — is the normal shape of parallel work, and a radar that
 * announced it would be a radar nobody reads. `risk` rather than `fail`
 * because nothing has gone wrong yet: this is the warning that arrives while
 * both agents are still running, which is the entire point of the feature.
 */
export function collisionNotice(collision: Collision): NotificationInput | null {
  if (collision.level === "touch") return null;
  const names = collision.workspaces.map((party) => party.label).join(" and ");
  return {
    kind: "app",
    tier: "risk",
    title:
      collision.level === "conflict"
        ? `${collision.path} already landed elsewhere`
        : `Two workspaces are editing ${collision.path}`,
    body:
      collision.level === "conflict"
        ? `${names} — one is already in your project, so the other will not apply cleanly.`
        : `${names} have both changed the same lines.`,
    // One notice per path per set of parties: re-raising it as each new status
    // comes back would turn the radar into a stream.
    replaceKey: `review:collision:${collision.path}`,
    osEligible: false,
  };
}

/**
 * What has been announced, so a refresh that changes nothing says nothing.
 *
 * The watcher refreshes on every idle edge and every filesystem batch, so
 * without a signature the same "finished" card would be pushed each time the
 * tally was re-read at the same value.
 */
export function fleetSignature(rows: FleetRow[], found: Collision[]): string {
  const ready = rows
    .filter((row) => row.status === "ready")
    .map((row) => `${row.paneId}:${row.summary.files}:${row.summary.additions}`)
    .join(",");
  const risky = found
    .filter((collision) => collision.level !== "touch")
    .map((collision) => `${collision.level}:${collision.path}`)
    .join(",");
  return `${ready}|${risky}`;
}
