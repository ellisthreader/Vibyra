import { useState } from 'react';
import { CANCELLED } from '../integrations/authorizeInBrowser';
import { hubSignIn } from '../integrations/hub/hubSignIn';
import { TaskPlanCard } from './TaskPlanCard';
import { useTaskPlan } from './useTaskPlan';
import type { AgentsApi, Teammate } from './types';
import type { FixStep } from './v2/planModel';

/**
 * The plan card for this draft (v2 only): asks once typing pauses and never gates Send. A fix that
 * needs a sign-in uses the same system sheet as the connections hub; "Choose access" opens this
 * teammate's Access tab. Nothing is connected, granted or sent on its own.
 */
export function AgentPlanSlot({ api, agent, text, attachments, enabled, onOpenAccess }: {
  api: AgentsApi; agent: Teammate; text: string; attachments: string[]; enabled: boolean; onOpenAccess(): void;
}) {
  const plan = useTaskPlan(api.overview, { agentId: agent.id, prompt: text, attachments }, enabled);
  const [fixing, setFixing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!plan.plan) return null;
  const connections = api.connections;
  const fix = async (step: FixStep, key: string) => {
    if (step.kind === 'grant') { onOpenAccess(); return; }
    const provider = step.provider;
    if (!connections || !provider) return;
    setFixing(key); setError(null);
    try {
      await hubSignIn(connections, returnUrl => provider.startsWith('mcp_') && step.connectionId
        ? connections.mcpSignIn(step.connectionId, returnUrl) : connections.start(provider, returnUrl));
      plan.refresh();
    } catch (e) {
      const words = e instanceof Error ? e.message : 'Sign-in did not finish.';
      if (words !== CANCELLED && !/cancelled/i.test(words)) setError(words);
    } finally { setFixing(null); }
  };
  return <TaskPlanCard plan={plan.plan} fixing={fixing} error={error} onFix={(step, key) => void fix(step, key)} />;
}
