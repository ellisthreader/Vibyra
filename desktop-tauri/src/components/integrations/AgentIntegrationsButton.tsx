import { useState } from "react";
import { useAccountStore } from "../../state/accountStore";
import { IntegrationsModal } from "./IntegrationsModal";
import { useIntegrationsAvailable } from "./useIntegrationsAvailable";

export function AgentIntegrationsButton({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [open, setOpen] = useState(false);
  const account = useAccountStore((s) => s.snapshot.profile?.welcomeKey);
  const available = useIntegrationsAvailable(agentId, account ?? "");
  if (!available) return null;
  return <>
    <button className="btn btn--secondary agent-integrations-button" onClick={() => setOpen(true)}>Integrations</button>
    {open && <IntegrationsModal key={`${account}:${agentId}`} agentId={agentId} agentName={agentName} onClose={() => setOpen(false)} />}
  </>;
}
