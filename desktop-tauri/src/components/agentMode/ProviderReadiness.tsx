import { useState } from "react";
import { useAgentRosterStore } from "../../state/agentRosterStore";
import { engineLabel } from "../../lib/agentEngineLabel";

export function ProviderReadiness() {
  const capabilities = useAgentRosterStore((state) => state.capabilities);
  const recheck = useAgentRosterStore((state) => state.recheck);
  const [busy, setBusy] = useState(false);
  return <details className="provider-readiness">
    <summary>Local providers · {capabilities.filter((entry) => entry.structured).length} compatible</summary>
    <p>Tasks run on this computer. Compatibility checks the installed CLI; each task must also start its protected runtime successfully.</p>
    {capabilities.map((entry) => <div key={entry.engine}>
      <strong>{engineLabel(entry.engine)}</strong> · {entry.version || "Not installed"}
      <p>{entry.structured ? "CLI compatible. Protected execution is checked at task start." : entry.blocker}</p>
    </div>)}
    <button className="btn btn--sm" disabled={busy} onClick={async () => { setBusy(true); try { await recheck(); } finally { setBusy(false); } }}>
      {busy ? "Checking…" : "Recheck providers"}
    </button>
  </details>;
}
