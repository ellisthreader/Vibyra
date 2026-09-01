import type { ApprovalRequest, Routine, RoutineRun } from "../agentWorkTypes";
import type { NotificationInput } from "../notificationTypes";

// What unattended work is allowed to interrupt you with.
//
// One rule decides almost everything here: **success is silent.** Only
// failures and decisions escalate. A teammate quietly doing its job at 09:00
// every morning is not news, and a toast every morning at 09:00 is exactly how
// a person learns to ignore toasts — at which point the one that mattered is
// ignored too.
//
// A skip is also not a failure. A run missed because the laptop was shut is a
// fact about the laptop; it belongs in amber on the row and nowhere else.
//
// Pure on purpose. The gate, the OS escalation, the rate ceiling and the
// dedupe window all live in `notificationPolicy`; this only decides whether
// there is anything to say.

/** The one decision card worth raising, or null while nothing is waiting. */
export function decisionNotice(approvals: readonly ApprovalRequest[]): NotificationInput | null {
  if (approvals.length === 0) return null;
  const [first] = approvals;
  const more = approvals.length - 1;
  return {
    kind: "approval",
    tier: "ask",
    title: `${first.agentName || "An agent"} needs a decision`,
    // The sentence that makes an unattended agent tolerable: it says what has
    // *not* happened yet.
    body:
      `${first.target || first.action} — nothing has been done yet.` +
      (more > 0 ? ` ${more} more waiting.` : ""),
    // One key for the queue, not one per card: three teammates raising three
    // cards in a minute is one interruption, and the count is in the body.
    dedupeKey: "agent:decisions-waiting",
    action: { id: "openDecisions", label: "Review" },
  };
}

/**
 * The notice for a run that just failed, or null for anything else.
 *
 * `runs` is that routine's history, newest first — the shape `loadRuns` puts
 * in the store. Only the newest is considered: an older failure was already
 * reported when it happened.
 */
export function routineFailureNotice(
  routineId: string,
  runs: readonly RoutineRun[],
  routines: readonly Routine[],
): NotificationInput | null {
  const last = runs[0];
  if (!last || last.status !== "failed") return null;
  const routine = routines.find((entry) => entry.id === routineId);
  return {
    kind: "agent",
    tier: "fail",
    title: `${routine?.name ?? "A routine"} failed`,
    body: last.error ?? "No reason was recorded. Open the chat it created to see what happened.",
    // Keyed by the run, so the same failure re-read from a refetch is one
    // notice while a genuinely new failure of the same routine is another.
    dedupeKey: `agent:routine-failed:${last.id}`,
    action: last.chatId ? { id: "openAgentChat", label: "Open chat", arg: last.chatId } : undefined,
  };
}
