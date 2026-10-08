import { AgentLogo } from "../common/AgentLogo";
import { memo } from "react";

import type { PaneDensity } from "../../lib/paneChrome";
import { useAgentStore } from "../../state/agentStore";
import { paneLabel, useTerminalStore, type PaneState } from "../../state/terminalStore";
import { agentIdentity, paneWord } from "../../lib/agentIdentity";
import { CloseIcon, ExpandIcon, MoonIcon, SunIcon } from "../common/Icons";
import { PaneAccountControl } from "./PaneAccountControl";
import { PaneRecovery } from "./PaneRecovery";
import { SuspendedPaneView } from "./SuspendedPaneView";
import { TerminalView } from "./TerminalView";

/** Memoised: the stage re-renders whenever any pane changes, and the store
 * keeps every untouched pane's object, so only the changed card repaints. */
export const TerminalPaneCard = memo(function TerminalPaneCard({
  pane,
  hidden,
  fontSize,
  density,
}: {
  pane: PaneState;
  hidden: boolean;
  fontSize: number;
  density: PaneDensity;
}) {
  const close = useTerminalStore((s) => s.close);
  const hibernate = useTerminalStore((s) => s.hibernate);
  const wake = useTerminalStore((s) => s.wake);
  const toggleZoom = useTerminalStore((s) => s.toggleZoom);
  const agents = useAgentStore((s) => s.agents);
  const loaded = useAgentStore((s) => s.loaded);
  const focusedId = useTerminalStore((s) => s.focusedId);
  const zoomedId = useTerminalStore((s) => s.zoomedId);
  const busy = useTerminalStore((s) => s.relaunching.includes(pane.id));
  const activity = useTerminalStore((s) => s.activity[pane.id] ?? "idle");
  const running = pane.status === "running";
  const hibernated = running && pane.visibility === "hibernated";
  const suspended = pane.status === "suspended";
  const attention = running && activity === "attention";
  const missingAgent = !running && pane.agentId !== "ssh" && loaded && !agents.some((a) => a.id === pane.agentId && a.installed);
  const state = paneWord(pane, activity);
  const agent = agentIdentity(pane.agentId, agents);
  return (
    <section className={`pane ${!running ? "pane--recoverable" : ""} ${focusedId === pane.id ? "pane--focused" : ""} ${hidden ? "pane--hidden" : ""} ${attention ? "pane--attn" : ""}`}
      style={{ "--pane-accent": pane.accent || "var(--accent)" } as React.CSSProperties}
      aria-label={`${pane.title} terminal`} data-pane-id={pane.id}>
      <header className="pane__header" onDoubleClick={(event) => {
        if (!hibernated && !(event.target instanceof Element && event.target.closest(".pane__actions, .pane__account"))) toggleZoom(pane.id);
      }}>
        <AgentLogo agentId={pane.agentId} name={agent.name} size={22} className={`pane__tile pane__tile--${density}`} />
        <button className="pane__title" title={pane.autoTitle || pane.customTitle ? `${paneLabel(pane)} · ${pane.title}` : pane.osc ?? pane.title} onClick={() => useTerminalStore.getState().setFocus(pane.id)}><strong>{paneLabel(pane)}</strong></button>
        <span className="pane__meta">{agent.name}{pane.workspaceMode === "safe" ? " · Safe worktree" : ""}</span>
        <span className={`sb-pill sb-pill--${state.tone} pane__state ${attention ? "pane__state--attention" : ""}`}>{state.word}</span>
        {running && <PaneAccountControl pane={pane} />}
        <div className="pane__actions">
          {running && <button className="icon-btn" aria-label={hibernated ? "Show terminal" : "Pause terminal rendering"} title={hibernated ? "Show terminal" : "Pause view — the agent keeps running"} onClick={() => void (hibernated ? wake(pane.id) : hibernate(pane.id))}>{hibernated ? <SunIcon size={14} /> : <MoonIcon size={14} />}</button>}
          {!hibernated && <button className={`icon-btn ${zoomedId === pane.id ? "icon-btn--active" : ""}`} aria-label={zoomedId === pane.id ? "Restore grid" : "Expand terminal"} title={zoomedId === pane.id ? "Restore grid" : "Expand terminal"} onClick={() => toggleZoom(pane.id)}><ExpandIcon size={14} /></button>}
          <button className="icon-btn icon-btn--danger" aria-label="Close terminal" title="Close terminal" disabled={busy} onClick={() => void close(pane.id)}><CloseIcon size={14} /></button>
        </div>
      </header>
      <div className="pane__body">
        {suspended ? <SuspendedPaneView snapshot={pane.snapshot} /> : hibernated ? (
          <button className="pane__sleeping" onClick={() => void wake(pane.id)}><MoonIcon size={24} /><span>View paused</span><small>Your agent is still running. Click to show the terminal.</small></button>
        ) : <TerminalView id={pane.id} fontSize={fontSize} bottomAnchored={pane.agentId !== "shell" && pane.agentId !== "ssh"} />}
        {!running && <PaneRecovery compact pane={pane} missingAgent={missingAgent} />}
      </div>
    </section>
  );
});
