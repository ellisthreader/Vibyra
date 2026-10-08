import { useMemo, useRef, useState } from 'react';
import type { FixStep } from '../../../../mobile/src/agents/v2/planModel.ts';
import { macSignIn } from '../settings/useMacHub';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { teammateApi } from './api';
import { connectionsClient } from './connectionsClient';
import { words } from './routinesClient';

/** AI accounts live in Settings; sign-in opens the provider page in the system browser. */
export const openAiAccounts = () => useWorkspaceStore.getState().openSettingsSection('ai', 'terminalAccounts');

/**
 * What each gap's button does. Connect and reconnect run the hub's own sign-in, then ask the plan
 * again; "Choose access" opens this teammate's Access tab. Nothing is granted, connected or sent here.
 */
export function usePlanFixes(reload: () => void, openAccess: () => void) {
  const client = useMemo(() => connectionsClient(teammateApi), []);
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState('');
  const cancelled = useRef(false);
  const run = async (step: FixStep) => {
    if (busy) return;
    setError('');
    if (step.kind === 'choose_ai_account') return openAiAccounts();
    if (step.kind === 'grant') return openAccess();
    if ((step.kind !== 'connect' && step.kind !== 'reconnect') || !step.provider) return;
    cancelled.current = false; setBusy(`${step.kind}:${step.provider}`);
    try { await macSignIn(client, () => client.start(step.provider!), () => cancelled.current); reload(); }
    catch (e) { setError(words(e)); } finally { setBusy(null); }
  };
  return { busy, error, run, cancel: () => { cancelled.current = true; } };
}
