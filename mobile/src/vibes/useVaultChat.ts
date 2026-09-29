import { useState } from 'react';
import type { Project, WorkspaceModel } from '../ui/types';
import { projectChatBlock } from './useProjectChat';
import { useVibes } from './VibesProvider';

/**
 * Starts a Vibyra tokens chat bound to the Mac's vault, the same way a project
 * chat is started, except the project is handed over at the moment of asking
 * rather than fixed when the hook is made: the Integrations page owns one
 * button for whichever vault the Mac reports. The chat is selected when this
 * resolves, so the caller only has to show it.
 */
export function useVaultChat(workspace: WorkspaceModel, onOpen: () => void) {
  const { store, wallet, pending } = useVibes();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const block =
    projectChatBlock(workspace, wallet) ?? (pending ? 'Wait for the reply in progress.' : null);
  const start = async (project: Project) => {
    const host = workspace.host;
    if (
      busy ||
      block ||
      !host ||
      !wallet ||
      !workspace.actions.vibesProjectRequest ||
      !store.api.attach
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await store.select(null);
      const chatId = await store.chat(project.name);
      const result = await workspace.actions.vibesProjectRequest('vibes.bind', {
        hostId: host.id,
        projectId: project.id,
        chatId,
        accountToken: wallet.accountToken,
      });
      if (typeof result.binding !== 'string')
        throw new Error('The computer did not authorize this integration.');
      await store.api.attach(chatId, host.id, project.id, result.binding);
      await store.refresh();
      onOpen();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The chat could not be started.');
    } finally {
      setBusy(false);
    }
  };
  return { block, busy, error, start };
}
