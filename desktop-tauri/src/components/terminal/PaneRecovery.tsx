import { computerName } from "../../lib/platform";
import { recoveryCopy, resumableAgent } from "../../lib/resumePolicy";
import { useTerminalStore, type PaneState } from "../../state/terminalStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { RestartIcon } from "../common/Icons";

export function PaneRecovery({ pane, missingAgent, compact = false }: { pane: PaneState; missingAgent: boolean; compact?: boolean }) {
  const busy = useTerminalStore((s) => s.relaunching.includes(pane.id));
  const error = useTerminalStore((s) => s.relaunchErrors[pane.id]);
  const resume = useTerminalStore((s) => s.resume);
  const restart = useTerminalStore((s) => s.restart);
  const copy = recoveryCopy(pane);
  const empty = pane.status === "suspended" && !pane.snapshot;
  return (
    <div className={`pane-recovery ${empty ? "pane-recovery--empty" : ""} ${compact && !empty ? "pane-recovery--compact" : ""}`} aria-busy={busy}>
      <div className="pane-recovery__card">
        <details className="pane-recovery__copy" open={!compact || empty}>
          <summary>{missingAgent ? "Reconnect your AI tool" : copy.title}</summary>
          <p>{missingAgent ? `${pane.agentId} is not available on this ${computerName}. Connect it in Integrations, then return to this chat.` : copy.detail}</p>
          {error && <p className="pane-recovery__error" role="alert">{error}</p>}
        </details>
        <div className="pane-recovery__actions">
          {missingAgent ? <button className="btn btn--primary" onClick={() => useWorkspaceStore.getState().openSettingsSection("ai", "terminalAccounts")}>Open AI accounts</button> : (
            <button className="btn btn--primary" disabled={busy} onClick={() => void resume(pane.id)}><RestartIcon size={14} />{busy ? "Opening…" : copy.action}</button>
          )}
          {resumableAgent(pane.agentId) && !missingAgent && <button className="btn pane-recovery__new" disabled={busy} onClick={() => void restart(pane.id)}>New chat</button>}
        </div>
      </div>
    </div>
  );
}
