import { useMemo } from "react";

import { suggestedActions, type AskAction } from "../../lib/askActions";
import type { AskPane } from "../../lib/askContext";
import { useReviewStore } from "../../state/reviewStore";
import { useTerminalStore } from "../../state/terminalStore";

/**
 * What Ask can see, shown before it is asked anything.
 *
 * The panel's honesty surface as much as its summary: the same facts that go
 * into the briefing, visible to the user first. And the actions here come from
 * `suggestedActions`, which reads the workspace — never from a model reply.
 * A pane's output cannot talk this panel into pressing anything.
 */

const DOT: Record<string, string> = {
  attention: "ask",
  working: "work",
  idle: "idle",
};

function paneTone(pane: AskPane): string {
  if (pane.status === "exited") return "dead";
  if (pane.status === "suspended" || pane.hibernated) return "off";
  return DOT[pane.activity] ?? "idle";
}

function paneNote(pane: AskPane): string {
  if (pane.status === "exited") {
    return pane.exitCode === null ? "exited" : `exit ${pane.exitCode}`;
  }
  if (pane.status === "suspended") return "saved";
  if (pane.hibernated) return "sleeping";
  if (pane.activity === "attention") return "waiting for you";
  if (pane.activity === "idle") return "idle";
  return "working";
}

function runAction(action: AskAction): void {
  const terminals = useTerminalStore.getState();
  if (action.kind === "focus") {
    terminals.setFocus(action.paneId);
  } else if (action.kind === "restart") {
    void terminals.restart(action.paneId);
  } else if (action.kind === "review") {
    useReviewStore.getState().openForPane(action.paneId);
  } else {
    for (const id of action.paneIds) void terminals.hibernate(id);
  }
}

export function AskWorkspaceCard({ panes }: { panes: AskPane[] }) {
  const actions = useMemo(() => suggestedActions(panes), [panes]);

  if (panes.length === 0) {
    return (
      <p className="ask-empty-note">
        No terminals are open yet. Ask about Vibyra itself, or launch an agent to give me
        something to watch.
      </p>
    );
  }

  return (
    <div className="ask-workspace">
      <span className="ask-workspace__label">What I can see</span>
      <ul className="ask-panes">
        {panes.map((pane) => (
          <li key={pane.id} className="ask-pane">
            <i className={`ask-dot ask-dot--${paneTone(pane)}`} aria-hidden="true" />
            <span className="ask-pane__name">{pane.label}</span>
            <span className="ask-pane__note">{paneNote(pane)}</span>
          </li>
        ))}
      </ul>
      {actions.length > 0 && (
        <div className="ask-actions">
          {actions.map((action) => (
            <button
              key={`${action.kind}-${"paneId" in action ? action.paneId : action.paneIds.join(",")}`}
              type="button"
              className="ask-action"
              onClick={() => runAction(action)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
