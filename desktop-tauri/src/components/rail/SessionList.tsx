import { useState } from "react";
import { ConversationTerminalRows } from './ConversationTerminalRows';
import { useConversationTerminals } from '../../state/conversationTerminalStore';

import { splitConversationRows } from "../../lib/conversationCards";
import { useProjectStore } from "../../state/projectStore";
import { paneLabel, useTerminalStore, type PaneState } from "../../state/terminalStore";
import { CloseIcon } from "../common/Icons";

/** Terminals use the navigation column's row primitive, so a terminal and a
 * project read as the same kind of entry. State is the one trailing dot every
 * row in this column uses; the shortcut digit gives way to Close on hover. */
const STATES: Record<string, string> = {
  exited: "Exited", sleeping: "Sleeping", attention: "Needs your attention", working: "Working",
};
function paneState(pane: PaneState, activity: string) {
  if (pane.status === "exited") return "exited";
  if (pane.status === "suspended" || pane.visibility === "hibernated") return "sleeping";
  return activity === "attention" ? "attention" : activity === "working" ? "working" : "";
}

function SessionRow({ pane, index }: { pane: PaneState; index: number }) {
  const setFocus = useTerminalStore((state) => state.setFocus);
  const focusedId = useTerminalStore((state) => state.focusedId);
  const close = useTerminalStore((state) => state.close);
  const wake = useTerminalStore((state) => state.wake);
  const rename = useTerminalStore((state) => state.rename);
  const activity = useTerminalStore((s) => s.activity[pane.id] ?? "idle");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const state = paneState(pane, activity);

  const commit = () => {
    rename(pane.id, draft);
    setEditing(false);
  };

  return (
    <div
      className={`pstrip__row ${focusedId === pane.id ? "pstrip__row--active" : ""}`}
      role="button"
      tabIndex={0}
      title={pane.osc ?? pane.title}
      onClick={() => {
        if (useProjectStore.getState().activeId !== pane.projectId && pane.projectId) void useProjectStore.getState().activate(pane.projectId);
        useConversationTerminals.setState({ focused: null, zoomed: null });
        if (pane.visibility === "hibernated") void wake(pane.id);
        else setFocus(pane.id);
      }}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.currentTarget.click(); }
      }}
      onDoubleClick={() => {
        setDraft(pane.customTitle ?? "");
        setEditing(true);
      }}
    >
      <span className={`pstrip__dot pstrip__dot--${state}`} aria-label={STATES[state] ?? "Idle"} />
      {editing ? (
        <input
          className="pstrip__rename"
          value={draft}
          placeholder={pane.osc ?? pane.title}
          autoFocus
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="pstrip__name">{paneLabel(pane)}</span>
      )}
      <span className="pstrip__trail pstrip__trail--rest">
        {state !== ""
          ? <span className={`pstrip__dot pstrip__dot--${state}`} aria-label={STATES[state]} />
          : index < 9 ? <kbd>{index + 1}</kbd> : null}
      </span>
      <span className="pstrip__trail pstrip__trail--action">
        <button
          className="icon-btn icon-btn--danger"
          title="Close terminal"
          aria-label={`Close ${paneLabel(pane)}`}
          onClick={(e) => {
            e.stopPropagation();
            void close(pane.id);
          }}
        >
          <CloseIcon size={12} />
        </button>
      </span>
    </div>
  );
}

/**
 * The active project's terminals: its panes, the conversations with a card on
 * the grid, and then — under their own heading, folded away — the chats the
 * engine still holds from earlier runs. Searching reaches all of them.
 */
export function SessionList({ query, projectId }: { query: string; projectId?: string }) {
  const activeId = useProjectStore((s) => s.activeId);
  const allPanes = useTerminalStore((s) => s.panes);
  const sessions = useConversationTerminals(s => s.sessions);
  const open = useConversationTerminals(s => s.open);
  const panes = allPanes.filter((p) => p.projectId === (projectId ?? activeId));
  const matches = panes.filter((pane) => paneLabel(pane).toLowerCase().includes(query));
  const { live } = splitConversationRows(sessions.filter(s => s.projectId === (projectId ?? activeId)), open);
  const found = (list: typeof sessions) => list.filter(s => s.title.toLowerCase().includes(query));
  const liveMatches = found(live);

  if (panes.length + live.length === 0) {
    return null;
  }
  if (matches.length + liveMatches.length === 0) {
    return <p className="pstrip__empty">No terminals match this search.</p>;
  }

  return (
    <>
      <div className="pstrip__list">
        <ConversationTerminalRows sessions={liveMatches} />
        {matches.map((pane) => (
          <SessionRow key={pane.id} pane={pane} index={panes.indexOf(pane)} />
        ))}
        {matches.length + liveMatches.length === 0 && <p className="pstrip__empty">Nothing is open here yet.</p>}
      </div>

    </>
  );
}
