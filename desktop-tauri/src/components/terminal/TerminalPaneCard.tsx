import { useAgentStore } from "../../state/agentStore";
import { paneLabel, useTerminalStore, type PaneState } from "../../state/terminalStore";
import { AgentMark } from "../common/AgentMark";
import { CloseIcon, ExpandIcon, MoonIcon, SunIcon } from "../common/Icons";
import { PaneAccountControl } from "./PaneAccountControl";
import { PaneRecovery } from "./PaneRecovery";
import { SuspendedPaneView } from "./SuspendedPaneView";
import { TerminalView } from "./TerminalView";

export function TerminalPaneCard({ pane, hidden }: { pane: PaneState; hidden: boolean }) {
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
  const stateLabel = suspended ? "Saved" : !running ? "Ended" : hibernated ? "View paused" : attention ? "Needs input" : activity === "working" ? "Working" : "Ready";
  return (
    <section className={`pane ${!running ? "pane--recoverable" : ""} ${focusedId === pane.id ? "pane--focused" : ""} ${hidden ? "pane--hidden" : ""} ${attention ? "pane--attn" : ""}`}
      style={{ "--pane-accent": pane.accent || "var(--accent)" } as React.CSSProperties}
      aria-label={`${pane.title} terminal`} data-pane-id={pane.id}>
      <header className="pane__header">
        <AgentMark agentId={pane.agentId} name={pane.title} accent={pane.accent} size={20} />
        <span className="pane__title" title={pane.osc ?? pane.title}><strong>{paneLabel(pane)}</strong></span>
        <span className={`pane__state ${attention ? "pane__state--attention" : ""}`}>{stateLabel}</span>
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
        ) : <TerminalView id={pane.id} bottomAnchored={pane.agentId !== "shell" && pane.agentId !== "ssh"} />}
        {!running && <PaneRecovery pane={pane} missingAgent={missingAgent} />}
      </div>
    </section>
  );
}
