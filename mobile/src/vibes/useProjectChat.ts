import { useState } from 'react';
import type { Project, WorkspaceModel } from '../ui/types';
import type { VibesWallet } from './types';
import { useVibes } from './VibesProvider';

/** Why a phone-run agent cannot start in this project right now, or null when it can. */
export function projectChatBlock(workspace: WorkspaceModel, wallet: VibesWallet | null): string | null {
  if (workspace.status !== 'connected') return 'Connect your computer to start one.';
  if (!workspace.vibesToolsAvailable || !workspace.actions.vibesProjectRequest) return 'Update Vibyra Host on your computer to use these here.';
  if (!wallet) return 'Sign in to use these.';
  if (!wallet.consented) return 'Open the AI chat once to switch on Vibyra tokens.';
  return null;
}

/**
 * Starts a Vibyra tokens chat that lives in one of the computer's projects: a
 * fresh chat on the chosen model, bound to the project by the computer, so the
 * model can read the project's files and propose edits you approve one by one.
 * The chat is selected when this resolves, so the caller only has to show it.
 */
export function useProjectChat(workspace: WorkspaceModel, project: Project, onOpen: () => void) {
  const { store, wallet, pending } = useVibes();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const block = projectChatBlock(workspace, wallet) ?? (pending ? 'Wait for the reply in progress.' : null);
  const start = async (model: string, title: string) => {
    const host = workspace.host;
    if (busy || block || !host || !wallet || !workspace.actions.vibesProjectRequest || !store.api.attach) return;
    setBusy(model); setError(null);
    try {
      // `chat` reuses the selected chat; a project chat must be its own.
      await store.select(null);
      store.setModel(model);
      const chatId = await store.chat(title || project.name);
      const result = await workspace.actions.vibesProjectRequest('vibes.bind',
        { hostId: host.id, projectId: project.id, chatId, accountToken: wallet.accountToken });
      if (typeof result.binding !== 'string') throw new Error('The computer did not authorize this project.');
      await store.api.attach(chatId, host.id, project.id, result.binding);
      await store.refresh();
      onOpen();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The chat could not be started.'); }
    finally { setBusy(null); }
  };
  return { block, busy, error, start };
}
