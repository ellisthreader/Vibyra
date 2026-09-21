import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { readFlag, writeFlag } from '../transport/deviceFlags';
import type { WorkspaceModel } from '../ui/types';
import { VibesScreen } from '../vibes/VibesScreen';
import { VibesStore } from '../vibes/VibesStore';
import { VibesStoreProvider } from '../vibes/VibesProvider';
import type { VibesApi } from '../vibes/types';
import { AgentDecision } from './AgentDecision';
import { teammateChatApi } from './chatAdapter';
import type { AgentsApi, Teammate } from './types';

export function AgentConversation({ agent, agents, api, workspace, enabled, active, onWallet }: {
  agent: Teammate; agents: AgentsApi; api: VibesApi; workspace: WorkspaceModel; enabled: boolean; active: boolean; onWallet(): void;
}) {
  const [store] = useState(() => {
    const key = `agent-chat.${encodeURIComponent(workspace.account!.email)}.${agent.id}`;
    const scoped = teammateChatApi(api, agents, agent);
    const store = new VibesStore(scoped, randomUUID, {
      read: async () => {
        let saved = {}; try { saved = JSON.parse(workspace.demo ? '{}' : await readFlag(key) ?? '{}'); } catch { /* Restore canonical chat even after damaged cache. */ }
        return JSON.stringify({ ...saved, selected: agent.chatId });
      }, write: async value => { if (!workspace.demo) await writeFlag(key, value); },
    });
    store.update({ selected: agent.chatId, draftScope: agent.chatId });
    return store;
  });
  useEffect(() => { void store.initialize(); }, [store]);
  useEffect(() => { if (active && agent.readCursor && agents.markRead) void agents.markRead(agent.id, agent.readCursor).catch(() => {}); }, [active, agent.id, agent.readCursor, agents]);
  useEffect(() => {
    if (!active) return;
    void store.refresh();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void store.refresh(); }, 5000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void store.refresh(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [store, active, agent.revision]);
  return <VibesStoreProvider value={store}>
    <VibesScreen workspace={workspace} onWallet={onWallet} teammate={agent} active={active} readOnly={!enabled || agent.archived}
      renderTool={(tool, turn) => tool.approval ? <AgentDecision key={tool.id} tool={tool} turn={turn} api={agents} store={store} enabled={enabled && !agent.archived && active} /> : null} />
  </VibesStoreProvider>;
}
