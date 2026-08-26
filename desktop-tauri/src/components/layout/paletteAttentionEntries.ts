import { promptOption } from "../../lib/agentPrompt";
import { answerAgentPrompt, scanAgentPrompt } from "../../lib/agentPromptScan";
import type { AgentPromptOffer, AgentPromptOption } from "../../notificationTypes";
import { useProjectStore } from "../../state/projectStore";
import { paneLabel, useTerminalStore, type PaneState } from "../../state/terminalStore";
import { CheckIcon, CloseIcon } from "../common/Icons";
import { AskIcon } from "../common/StatusIcons";
import type { CommandPaletteEntry } from "../../lib/paletteTypes";

// The reason the palette exists at all once you are running four agents: the
// one that is blocked on you is findable, and answerable, without hunting for
// which pane went quiet.

/** Brings a pane on screen, switching project first if it is somewhere else. */
function focus(pane: PaneState): void {
  const { activate } = useProjectStore.getState();
  void activate(pane.projectId).then(() => useTerminalStore.getState().setFocus(pane.id));
}

/**
 * Answers on the user's behalf, and falls back to showing them the question.
 *
 * `answerAgentPrompt` re-reads the pane and refuses if the agent has redrawn
 * since the palette read it — by then the keystroke no longer means what the
 * row said it did. A refused answer must not look like a click that did
 * nothing, so it turns into a jump to the pane.
 */
function answer(pane: PaneState, offer: AgentPromptOffer, option: AgentPromptOption): void {
  if (answerAgentPrompt(offer, option) !== "sent") focus(pane);
}

function offerEntries(pane: PaneState, offer: AgentPromptOffer): CommandPaletteEntry[] {
  const name = paneLabel(pane);
  const question = offer.question || "is waiting for an answer";
  const detail = offer.detail[0];
  const entries: CommandPaletteEntry[] = [];
  const add = (
    suffix: string,
    label: string,
    intent: Parameters<typeof promptOption>[1],
    extra: Partial<CommandPaletteEntry>,
  ) => {
    const option = promptOption(offer, intent);
    if (!option) return;
    entries.push({
      id: `prompt-${pane.id}-${suffix}`,
      kind: "attention",
      group: "Needs you",
      label,
      detail,
      code: true,
      keywords: `${name} ${question} approve deny allow permission`,
      attention: true,
      weight: 900,
      run: () => answer(pane, offer, option),
      ...extra,
    });
  };

  add("yes", `Approve — ${question}`, "affirm", { icon: CheckIcon, weight: 1_000 });
  add("always", `Always allow this for ${name}`, "remember", { icon: CheckIcon });
  add("no", `Decline — ${name}`, "decline", { icon: CloseIcon, danger: true });
  return entries;
}

/** Panes the activity ticker has flagged as blocked, most useful first. */
export function attentionEntries(activeProjectId: string | null): CommandPaletteEntry[] {
  const { panes, activity } = useTerminalStore.getState();
  const waiting = panes.filter((pane) => activity[pane.id] === "attention");
  const entries: CommandPaletteEntry[] = [];

  for (const pane of waiting) {
    // Only a pane in the project on screen has a live xterm buffer to read,
    // so only that one can be answered from here. The rest get a way in.
    const offer = pane.projectId === activeProjectId ? scanAgentPrompt(pane.id) : null;
    if (offer) entries.push(...offerEntries(pane, offer));
    entries.push({
      id: `attn-${pane.id}`,
      kind: "attention",
      group: "Needs you",
      label: offer?.question
        ? `Open ${paneLabel(pane)} — ${offer.question}`
        : `${paneLabel(pane)} — waiting for input`,
      icon: AskIcon,
      attention: true,
      weight: offer ? 700 : 880,
      keywords: "waiting blocked prompt attention",
      run: () => focus(pane),
    });
  }
  return entries;
}
