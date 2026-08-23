import { useState } from "react";

import { useProjectStore } from "../../state/projectStore";
import { paneLabel, useTerminalStore, type PaneState } from "../../state/terminalStore";
import { CloseIcon, MoonIcon } from "../common/Icons";

function SessionRow({ pane, index }: { pane: PaneState; index: number }) {
  const setFocus = useTerminalStore((state) => state.setFocus);
  const focusedId = useTerminalStore((state) => state.focusedId);
  const close = useTerminalStore((state) => state.close);
  const wake = useTerminalStore((state) => state.wake);
  const rename = useTerminalStore((state) => state.rename);
  const activity = useTerminalStore((s) => s.activity[pane.id] ?? "idle");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const state =
    pane.status === "exited"
      ? "exited"
      : pane.visibility === "hibernated"
        ? "sleeping"
        : activity;

  const commit = () => {
    rename(pane.id, draft);
    setEditing(false);
  };

  return (
    <div
      className={`session-row ${focusedId === pane.id ? "session-row--active" : ""}`}
      role="button"
      tabIndex={0}
      title={paneLabel(pane)}
      onClick={() => {
        if (pane.visibility === "hibernated") void wake(pane.id);
        else setFocus(pane.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") setFocus(pane.id);
      }}
      onDoubleClick={() => {
        setDraft(pane.customTitle ?? "");
        setEditing(true);
      }}
    >
      <span className={`adot adot--${state}`} />
      {editing ? (
        <input
          className="session-row__edit"
          value={draft}
          placeholder={paneLabel(pane)}
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
        <span className="session-row__label">{paneLabel(pane)}</span>
      )}
      {state === "sleeping" && <MoonIcon size={11} />}
      {index < 9 && <kbd className="session-row__kbd">{index + 1}</kbd>}
      <button
        className="icon-btn icon-btn--danger session-row__close"
        title="Close terminal"
        onClick={(e) => {
          e.stopPropagation();
          void close(pane.id);
        }}
      >
        <CloseIcon size={11} />
      </button>
    </div>
  );
}

export function SessionList() {
  const activeId = useProjectStore((s) => s.activeId);
  const allPanes = useTerminalStore((s) => s.panes);
  const panes = allPanes.filter((p) => p.projectId === activeId);

  if (panes.length === 0) {
    return null;
  }

  return (
    <div className="session-list">
      {panes.map((pane, index) => (
        <SessionRow key={pane.id} pane={pane} index={index} />
      ))}
    </div>
  );
}
