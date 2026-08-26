import type { ReleasedModel } from "../ipc/models";
import type { PreviewStatus } from "../previewTypes";
import { useNotificationStore } from "../state/notificationStore";
import { useTerminalStore } from "../state/terminalStore";
import type { PaneState } from "../state/terminalStoreTypes";
import { attentionFromBell, demotePromptAttention, type ActivityState } from "./activity";
import { promptHeadline } from "./agentPrompt";
import { scanAgentPrompt, type PromptAnswer } from "./agentPromptScan";
import { attentionVerdict, type ActivityTransition } from "./activityTransitions";
import { notePreviewTransition } from "./previewNotifications";
import { exitNoticeSuppressed, exitNotification } from "./sessionExitNotifications";
import { terminalDisplayTitle } from "./terminalTitle";

// Impure glue: pulls the live pane out of the store, hands it to the pure
// decision functions, and pushes whatever comes back. Kept apart from those
// functions so they stay unit-testable, and apart from the store so the store
// keeps its no-other-store import rule.

export function notifySessionExit(id: number, code: number | null): void {
  const pane = useTerminalStore.getState().panes.find((candidate) => candidate.id === id);
  const notice = exitNotification(pane, code, exitNoticeSuppressed(id));
  if (notice) useNotificationStore.getState().push(notice);
}

/**
 * A restored pane that could not be given its old conversation back.
 *
 * One shared dedupe key on purpose: restoring a workspace can start several of
 * these at once, and four identical notices say nothing the first one did not.
 */
export function notifyNewConversation(pane: PaneState): void {
  useNotificationStore.getState().push({
    kind: "project",
    tier: "news",
    title: `${terminalDisplayTitle(pane)} started a new conversation`,
    body: "Its previous one could not be identified, so this pane is fresh. The output you were reading is still above it.",
    dedupeKey: "resume:new-conversation",
  });
}

/** A resume the agent refused outright, restarted clean rather than left dead. */
export function notifyResumeRestarted(pane: PaneState): void {
  useNotificationStore.getState().push({
    kind: "project",
    tier: "risk",
    title: `${terminalDisplayTitle(pane)} could not continue where it left off`,
    body: "The agent refused its previous conversation, so the pane was restarted on a new one rather than left closed.",
    dedupeKey: "resume:restarted",
  });
}

function paneTitle(id: number): string {
  const pane = useTerminalStore.getState().panes.find((candidate) => candidate.id === id);
  if (!pane) return "An agent";
  return terminalDisplayTitle(pane);
}

export function notifyActivityTransitions(transitions: ActivityTransition[]): void {
  const push = useNotificationStore.getState().push;
  for (const transition of transitions) {
    const label = paneTitle(transition.id);
    const action = { id: "focusSession", label: "Open terminal", arg: transition.id } as const;
    if (transition.kind === "attention") {
      // Read once, here, on the edge — the ticker has already waited out 2.5s
      // of silence, so this costs a buffer walk an hour, not one per write.
      // The scan is the verdict: the heuristic that raised the edge only
      // nominated this pane, it does not get to caption the toast.
      const prompt = scanAgentPrompt(transition.id);
      const verdict = attentionVerdict(
        prompt !== null,
        attentionFromBell(transition.id),
        transition.workedMs,
      );
      if (verdict === "silent" || verdict === "finished") {
        // Withdraw the false candidate so the pane's dot and any lingering
        // prompt toast settle back on the next tick.
        demotePromptAttention(transition.id);
      }
      if (verdict === "silent") continue;
      if (verdict === "finished") {
        push({
          kind: "agent",
          tier: "done",
          title: `${label} looks finished`,
          body: "It worked for a while and has settled without asking for anything. Open it to read the result.",
          // Shares the completion key so this, a quiet run and a real exit
          // all collapse into one card.
          dedupeKey: "agentDone",
          action,
        });
        continue;
      }
      push({
        kind: "approval",
        tier: "ask",
        title: prompt ? promptHeadline(label, prompt) : `${label} needs you`,
        body:
          prompt?.question ||
          "It rang the terminal bell — something there is waiting for you.",
        dedupeKey: `attention:${transition.id}`,
        action,
        prompt: prompt ?? undefined,
      });
      continue;
    }
    push({
      kind: "agent",
      tier: "done",
      title: `${label} has gone quiet`,
      body: "No output for a while — it may be finished.",
      // Shares the completion key so a quiet run and a real exit collapse together.
      dedupeKey: "agentDone",
      action,
    });
  }
}

/** Replaces the old habit of routing new-model news through the error toast. */
export function notifyModelsReleased(models: ReleasedModel[]): void {
  if (models.length === 0) return;
  const names = models.slice(0, 3).map((model) => model.name).join(", ");
  useNotificationStore.getState().push({
    kind: "models",
    tier: "news",
    title: models.length === 1 ? "New model released" : `${models.length} new models released`,
    body: models.length > 3 ? `${names}…` : names,
    dedupeKey: "models",
    osEligible: false,
    action: { id: "openModelPicker", label: "Choose a model" },
  });
}

/** Preview phases are polled, so the edge is derived from the last status the
 * module saw rather than from an event. */
export function notifyPreviewStatus(next: PreviewStatus): void {
  const notice = notePreviewTransition(next);
  if (notice) useNotificationStore.getState().push(notice);
}

/**
 * Retires a prompt toast the moment its pane stops asking.
 *
 * `answerAgentPrompt` would refuse a click on a settled prompt anyway, but it
 * can only do that after the user has made it. A sticky card still offering
 * buttons for a question already answered in the terminal is worse than no
 * card at all.
 */
export function dismissSettledPrompts(states: Readonly<Record<number, ActivityState>>): void {
  const { visible, dismiss } = useNotificationStore.getState();
  for (const item of visible) {
    if (item.prompt && states[item.prompt.sessionId] !== "attention") dismiss(item.id);
  }
}

const UNANSWERED: Record<Exclude<PromptAnswer, "sent">, { title: string; body: string }> = {
  stale: {
    title: "That question has moved on",
    body: "The agent redrew it, so Vibyra sent nothing. Open the terminal to see what it is asking now.",
  },
  gone: {
    title: "That terminal is not open",
    body: "Vibyra could not read the pane, so it sent nothing. Open it to answer there.",
  },
};

/** Says plainly that a click was refused. Never escalated to the OS: the user
 * is at the keyboard by definition, having just pressed the button. */
export function notifyPromptUnanswered(
  sessionId: number,
  outcome: Exclude<PromptAnswer, "sent">,
): void {
  const copy = UNANSWERED[outcome];
  useNotificationStore.getState().push({
    kind: "approval",
    tier: "risk",
    title: copy.title,
    body: copy.body,
    dedupeKey: `attention:unanswered:${sessionId}`,
    osEligible: false,
    action: { id: "focusSession", label: "Open terminal", arg: sessionId },
  });
}
