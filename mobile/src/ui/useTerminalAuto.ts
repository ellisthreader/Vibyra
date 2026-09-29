import { useRef } from 'react';
import { randomUUID } from 'expo-crypto';
import { readFlag, writeFlag } from '../transport/deviceFlags';
import { terminalCandidates, verifyTerminalDecision } from '../vibes/terminalDecision';
import type { TerminalCandidate } from '../vibes/terminalDecision';
import type { VibesApi } from '../vibes/types';
import type { AiAccountsSnapshot } from '../settings/aiAccountsTypes';
import type { WorkspaceModel } from './types';

interface AutoRequest {
  source: 'accounts' | 'vibyra';
  text: string;
  rows: { id: string; name: string; kind?: string; efforts?: string[] }[];
  assertSelection(): void;
  terminalId: string;
  onCandidates(models: TerminalCandidate[]): void;
}

export function useTerminalAuto(workspace: WorkspaceModel, api: VibesApi | undefined) {
  const live = useRef({ workspace, api }); live.current = { workspace, api };
  return async ({ source, text, rows, assertSelection, terminalId, onCandidates }: AutoRequest) => {
    const host = workspace.host?.id;
    const account = workspace.account?.email;
    const assertCurrent = () => {
      assertSelection();
      if (live.current.api !== api || live.current.workspace.host?.id !== host ||
        live.current.workspace.account?.email !== account || live.current.workspace.status !== 'connected')
        throw new Error('Your account or computer changed. Open this terminal again.');
    };
    if (!api?.terminalDecision) throw new Error('Vibyra Auto is unavailable. Try again.');
    if (!text.trim()) throw new Error('Enter a message to send.');
    let eligible = rows;
    if (source === 'accounts') {
      if (!workspace.aiAccountsAvailable || !workspace.actions.aiAccounts)
        throw new Error('Update Vibyra on your computer to use Auto with your AI accounts.');
      const snapshot = await workspace.actions.aiAccounts('list') as AiAccountsSnapshot;
      assertCurrent();
      // Match the Mac's launchAccountId: a signed-out preferred account falls back to another connected account.
      const connected = new Set(snapshot.providers.filter(p => p.accounts.some(a => a.status === 'connected')).map(p => p.runtimeId));
      eligible = rows.filter(row => row.kind && connected.has(row.kind));
    }
    const models = terminalCandidates(eligible);
    if (!models.length) throw new Error(source === 'accounts' ? 'No connected AI models are available for Auto. Open Settings → Accounts.' : 'No Vibyra token models are available. Try again later.');
    assertCurrent();
    onCandidates(models);
    const identity = JSON.stringify([account, host, source, text, models]);
    const key = `terminal-auto:${account}:${host}:${terminalId}`;
    let saved: { identity: string; id: string } | null = null;
    try { saved = JSON.parse(await readFlag(key) || 'null'); } catch { /* replace invalid receipt */ }
    const id = saved?.identity === identity ? saved.id : randomUUID();
    await writeFlag(key, JSON.stringify({ identity, id })); assertCurrent();
    try {
      const result = await api.terminalDecision({ id, source, text, models, consent: true });
      assertCurrent();
      return verifyTerminalDecision(result, models);
    } catch (error) {
      if (typeof (error as { status?: number }).status === 'number' && [400, 403, 409, 422, 429, 503].includes((error as { status: number }).status))
        await writeFlag(key, '');
      throw error;
    }
  };
}
