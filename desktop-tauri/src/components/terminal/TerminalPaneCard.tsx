import { useAgentStore } from "../../state/agentStore";
import { useReviewStore } from "../../state/reviewStore";
import { paneLabel, useTerminalStore, type PaneState } from "../../state/terminalStore";
import { AgentMark } from "../common/AgentMark";
import { CloseIcon, ExpandIcon, GitBranchIcon, MoonIcon, RestartIcon, SunIcon } from "../common/Icons";
import { PaneAccountBadge } from "./PaneAccountBadge";
import { SuspendedPaneView } from "./SuspendedPaneView";
import { TerminalView } from "./TerminalView";

export function TerminalPaneCard({
  pane,
  hidden,
  active,
}: {
  pane: PaneState;
  hidden: boolean;
  active: boolean;
}) {
  const close = useTerminalStore((state) => state.close);
  const hibernate = useTerminalStore((state) => state.hibernate);
  const wake = useTerminalStore((state) => state.wake);
  const toggleZoom = useTerminalStore((state) => state.toggleZoom);
  const restart = useTerminalStore((state) => state.restart);
  const resume = useTerminalStore((state) => state.resume);
  const agents = useAgentStore((state) => state.agents);
  const focusedId = useTerminalStore((state) => state.focusedId);
  const zoomedId = useTerminalStore((state) => state.zoomedId);
  const activity = useTerminalStore((s) => s.activity[pane.id] ?? "idle");
  const isFocused = focusedId === pane.id;
  const isZoomed = zoomedId === pane.id;
  const hibernated = pane.visibility === "hibernated";
  const exited = pane.status === "exited";
  const suspended = pane.status === "suspended";
  const attention = !exited && !hibernated && !suspended && activity === "attention";
  // An agent uninstalled since the last session cannot be relaunched; say so
  // rather than letting Resume fail on click.
  const missingAgent =
    suspended &&
    pane.agentId !== "ssh" &&
    agents.length > 0 &&
    !agents.some((agent) => agent.id === pane.agentId && agent.installed);

  return (
    <section
      className={`pane ${isFocused ? "pane--focused" : ""} ${hidden ? "pane--hidden" : ""} ${
        attention ? "pane--attn" : ""
      }`}
      style={{ "--pane-accent": pane.accent || "var(--accent)" } as React.CSSProperties}
      aria-label={`${paneLabel(pane)} terminal`}
    >
      <header className="pane__header">
        <AgentMark agentId={pane.agentId} name={pane.title} accent={pane.accent} size={20} />
        <span className="pane__title">
          <strong>{paneLabel(pane)}</strong>
          {!suspended && <small>#{pane.id}</small>}
        </span>
        <span
          className={`adot adot--${
            exited ? "exited" : hibernated ? "sleeping" : activity
          } pane__dot`}
        />
        {(exited || hibernated || suspended || attention) && (
          <span
            className={`pill pane__status ${exited ? "pill--danger" : "pill--amber"}`}
            title={pane.exitCode !== null ? `exit code ${pane.exitCode}` : undefined}
          >
            {exited ? "exited" : hibernated ? "sleeping" : suspended ? "saved" : "needs input"}
          </span>
        )}
        {!exited && !suspended ? <PaneAccountBadge pane={pane} /> : null}
        {pane.workspace && (
          <button
            type="button"
            className="pane__review"
            title="Ran in a safe workspace — review its changes"
            onClick={() => useReviewStore.getState().openForPane(pane.id)}
          >
            <GitBranchIcon size={11} /> Review
          </button>
        )}
        <div className="pane__actions">
          {suspended ? (
            <button
              className="icon-btn"
              title={missingAgent ? `${pane.agentId} is not installed` : "Resume"}
              disabled={missingAgent}
              onClick={() => void resume(pane.id)}
            >
              <RestartIcon size={14} />
            </button>
          ) : exited ? (
            <button className="icon-btn" title="Restart" onClick={() => void restart(pane.id)}>
              <RestartIcon size={14} />
            </button>
          ) : hibernated ? (
            <button className="icon-btn" title="Wake" onClick={() => void wake(pane.id)}>
              <SunIcon size={14} />
            </button>
          ) : (
            <button
              className="icon-btn"
              title="Hibernate — frees CPU & RAM, output kept natively"
              onClick={() => void hibernate(pane.id)}
            >
              <MoonIcon size={14} />
            </button>
          )}
          {!hibernated && !suspended && (
            <button
              className={`icon-btn ${isZoomed ? "icon-btn--active" : ""}`}
              title={isZoomed ? "Restore grid" : "Zoom"}
              onClick={() => toggleZoom(pane.id)}
            >
              <ExpandIcon size={14} />
            </button>
          )}
          <button
            className="icon-btn icon-btn--danger"
            title="Close"
            onClick={() => void close(pane.id)}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      </header>
      <div className="pane__body">
        {suspended ? (
          <>
            <SuspendedPaneView snapshot={pane.snapshot} />
            <div className="pane__suspended">
              <span>
                {missingAgent
                  ? `${pane.agentId} is no longer installed`
                  : "Saved from your last session — not running"}
              </span>
              <button className="btn" disabled={missingAgent} onClick={() => void resume(pane.id)}>
                <RestartIcon size={13} /> Resume
              </button>
            </div>
          </>
        ) : hibernated ? (
          <button className="pane__sleeping" onClick={() => void wake(pane.id)}>
            <MoonIcon size={24} />
            <span>Hibernated</span>
            <small>Output buffered in Rust — click to wake</small>
          </button>
        ) : (
          <>
            <TerminalView
              id={pane.id}
              bottomAnchored={pane.agentId !== "shell" && pane.agentId !== "ssh"}
              active={active && !hidden}
            />
            {exited && (
              <div className="pane__exited">
                <span>
                  Process exited{pane.exitCode !== null ? ` · code ${pane.exitCode}` : ""}
                </span>
                <button className="btn" onClick={() => void restart(pane.id)}>
                  <RestartIcon size={13} /> Restart
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
