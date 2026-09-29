import { useAutoTerminalWorkspace } from '../ui/useAutoTerminalWorkspace';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { readFlag, writeFlag } from '../transport/deviceFlags';
import type { Session, WorkspaceModel } from '../ui/types';
import { useVibesStore } from './VibesProvider';
import type { VibesChat } from './types';

const idle = () => () => {};
const empty = () => null;
export function fundedSession(chat: VibesChat): Session {
  return { id: `funded:${chat.id}`, fundedChatId: chat.id, projectId: chat.project_id!, title: chat.title,
    kind: 'vibyra', status: chat.terminal_closed_at ? 'exited' : 'running', createdAt: chat.created_at ?? '', canInput: true };
}

/** Explicit session adapter over the metered project engine. Never enters phone-chat navigation. */
export function useFundedWorkspace(base: WorkspaceModel): WorkspaceModel {
  return useAutoTerminalWorkspace(useMeteredWorkspace(base));
}
function useMeteredWorkspace(base: WorkspaceModel): WorkspaceModel {
  const store = useVibesStore();
  const state = useSyncExternalStore(store?.subscribe ?? idle, store?.snapshot ?? empty, store?.snapshot ?? empty);
  const [selection, setSelection] = useState<string | null>(null);
  const current = useRef({ base, store }); current.current = { base, store };
  const chats = state?.chats.filter(c => c.terminal_model && c.host_id === base.host?.id && c.project_id) ?? [];
  const sessions = chats.map(fundedSession);
  useEffect(() => {
    const selected = state?.chats.find(c => c.id === state.selected && c.terminal_model && c.host_id === base.host?.id);
    setSelection(selected ? `funded:${selected.id}` : null);
  }, [state?.selected, state?.chats, base.host?.id]);
  if (!store) return base;
  const selectSession = (id: string | null) => {
    const chat = chats.find(c => `funded:${c.id}` === id);
    setSelection(chat ? id : null);
    if (chat) {
      base.actions.selectSession(null);
      void store.select(chat.id).catch(e => store.error(e));
    } else {
      if (state?.chats.some(c => c.id === state.selected && c.terminal_model)) void store.select(null).catch(e => store.error(e));
      base.actions.selectSession(id);
    }
  };
  return { ...base, sessions: [...base.sessions, ...sessions], selectedSessionId: selection ?? base.selectedSessionId,
    actions: { ...base.actions, selectSession,
      createSession: async (projectId, kind, title, options) => {
        if (options?.source !== 'vibyra') {
          if (kind === 'vibyra') throw new Error('Choose a funding source before launching.');
          return base.actions.createSession(projectId, kind, title, options);
        }
        const wallet = store.state.wallet;
        const host = base.host;
        if (!wallet?.entitlements.fundedTerminals || !host || !base.fundedTerminalsAvailable ||
          base.status !== 'connected' || !base.actions.vibesProjectRequest || !store.api.createTerminal || !options.model)
          throw new Error('Reconnect to an updated computer with your Pro account to launch this terminal.');
        const assertCurrent = () => {
          if (current.current.store !== store || current.current.base.host?.id !== host.id)
            throw new Error('Your account or computer changed. Open the project again.');
        };
        // Persist launch identity before either write. A dropped reply can only retry this same receipt.
        const key = `funded-launch:${wallet.accountToken}:${host.id}:${projectId}:${options.model}:${options.budget ?? 10}:${options.tools === true}:${options.effort ?? "default"}`;
        const id = options.requestId ?? (await readFlag(key) || store.uuid());
        await writeFlag(key, id); assertCurrent();
        const receipt = await base.actions.vibesProjectRequest('vibes.bind', {
          source: 'vibyra', hostId: host.id, projectId, chatId: id, accountToken: wallet.accountToken,
          model: options.model, tools: options.tools === true,
        });
        assertCurrent();
        if (typeof receipt.binding !== 'string') throw new Error('Your computer could not authorize this terminal.');
        const chat = await store.api.createTerminal({ id, title: title.slice(0, 100), source: 'vibyra', tools: options.tools === true,
          model: options.model, effort: options.effort as import('./types').Effort | null | undefined, hostId: host.id, projectId, binding: receipt.binding, budget: options.budget ?? 10 });
        assertCurrent();
        store.update({ chats: [chat, ...store.state.chats.filter(c => c.id !== id)] });
        // Selecting loads exactly this transcript before it is shown in SessionScreen.
        await store.select(id); assertCurrent();
        setSelection(`funded:${id}`);
        await writeFlag(key, '');
        return fundedSession(chat);
      },
      stopSession: async id => {
        const chat = chats.find(c => `funded:${c.id}` === id);
        if (!chat) return base.actions.stopSession(id);
        if (!store.api.closeTerminal) throw new Error('Update the app to close this terminal.');
        if (store.state.selected === chat.id) await store.stop();
        await store.api.closeTerminal(chat.id);
        await store.refresh();
      },
    },
  };
}
