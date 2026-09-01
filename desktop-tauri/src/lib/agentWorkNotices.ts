import type { ApprovalRequest, Routine, RoutineRun } from "../agentWorkTypes";
import { useNotificationStore } from "../state/notificationStore";
import { decisionNotice, routineFailureNotice } from "./agentWorkNoticePolicy.ts";

// The two triggers Agent Mode raises, fired from the work bus so they reach
// you regardless of which mode is showing.
//
// The notification runtime already had everything these need — an `approval`
// kind, an `ask` tier, focus gating, the OS gap, the per-minute ceiling and
// the dedupe window — and every caller of it was a terminal trigger. Agent
// Mode raised none, which is why unattended work was invisible from the one
// place people actually sit.
//
// Whether there is anything to say is `agentWorkNoticePolicy`, which is pure;
// this is only the push.

export function notifyDecisionsWaiting(approvals: readonly ApprovalRequest[]): void {
  const notice = decisionNotice(approvals);
  if (notice) useNotificationStore.getState().push(notice);
}

export function notifyRoutineFailed(
  routineId: string,
  runs: readonly RoutineRun[],
  routines: readonly Routine[],
): void {
  const notice = routineFailureNotice(routineId, runs, routines);
  if (notice) useNotificationStore.getState().push(notice);
}
