import { useEffect, useRef, useState } from 'react';
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
import { runChatApi, type RunChatApi } from './v2/runChat';
import { shouldMarkRead } from './v2/overviewModel';
import { AgentPlanSlot } from './AgentPlanSlot';
import type { RunsApi } from './v2/runsApi';
import { useGrantedAccounts } from './useGrantedAccounts';

export function AgentConversation({
  agent,
  agents,
  api,
  workspace,
  enabled,
  active,
  onWallet,
  runs,
  onOpenAccess,
  onRead,
  onStale,
}: {
  /** v2: "Choose access" on the plan card opens this teammate's Access tab. */
  onOpenAccess?(): void;
  /** v2: this device marked the teammate read; `onStale` asks for a fresh roster (409 `stale_cursor`). */
  onRead?(id: string, cursor: string): void;
  onStale?(): void;
  /** Present when this account uses Agent v2 runs; the conversation is keyed by it. */
  runs?: RunsApi;
  agent: Teammate;
  agents: AgentsApi;
  api: VibesApi;
  workspace: WorkspaceModel;
  enabled: boolean;
  active: boolean;
  onWallet(): void;
}) {
  const [v2] = useState<RunChatApi | null>(() => {
    if (!runs) return null;
    const key = `agent-run-sends.${encodeURIComponent(workspace.account!.email)}.${agent.id}`;
    let memory: string | null = null;
    return runChatApi(teammateChatApi(api, agents, agent), runs, agent, {
      read: async () => (workspace.demo ? memory : readFlag(key)),
      write: async (value) => {
        if (workspace.demo) memory = value;
        else await writeFlag(key, value);
      },
    }, agents.overview);
  });
  const [decisions] = useState<AgentsApi>(() =>
    v2 && runs
      ? { ...agents, decide: (id, fingerprint, answer) =>
          v2.owns(id) ? runs.decide(id, fingerprint, answer) : agents.decide(id, fingerprint, answer) }
      : agents,
  );
  const [store] = useState(() => {
    const key = `agent-chat.${encodeURIComponent(workspace.account!.email)}.${agent.id}`;
    const scoped = v2 ?? teammateChatApi(api, agents, agent);
    const store = new VibesStore(scoped, randomUUID, {
      read: async () => {
        let saved = {};
        try {
          saved = JSON.parse(workspace.demo ? '{}' : ((await readFlag(key)) ?? '{}'));
        } catch {
          /* Restore canonical chat even after damaged cache. */
        }
        return JSON.stringify({ ...saved, selected: agent.chatId });
      },
      write: async (value) => {
        if (!workspace.demo) await writeFlag(key, value);
      },
    });
    store.update({ selected: agent.chatId, draftScope: agent.chatId });
    return store;
  });
  useEffect(() => {
    void store.initialize();
  }, [store]);
  const accounts = useGrantedAccounts(v2 ? agents.connections : undefined, agent.id, agent.revision);
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (!active) return;
    // v2 threads: the per-device read marker from `GET /roster`; a 409 means the latest run moved on.
    if (v2 && agents.overview) {
      if (!shouldMarkRead(agent, marked.current)) return;
      const cursor = agent.readCursor!;
      marked.current = cursor;
      void agents.overview.markRead(agent.id, cursor).then((result) => {
        if (result === 'stale') { marked.current = null; onStale?.(); } else onRead?.(agent.id, cursor);
      }).catch(() => { if (marked.current === cursor) marked.current = null; });
      return;
    }
    if (agent.readCursor && agents.markRead) void agents.markRead(agent.id, agent.readCursor).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, agent.id, agent.readCursor, agent.unread, agents, v2]);
  useEffect(() => {
    if (!active) return;
    void store.refresh();
    // v2 follows the contract's backoff (1 s working … 10 s waiting for the Mac); v1 keeps 5 s.
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const poll = () => {
      if (!stopped) timer = setTimeout(() => {
        void (AppState.currentState === 'active' ? store.refresh() : Promise.resolve()).finally(poll);
      }, v2?.nextDelay() ?? 5000);
    };
    poll();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void store.refresh();
    });
    return () => {
      stopped = true;
      clearTimeout(timer);
      listener.remove();
    };
  }, [store, active, agent.revision, v2]);
  return (
    <VibesStoreProvider value={store}>
      <VibesScreen
        workspace={workspace}
        onWallet={onWallet}
        teammate={agent}
        active={active}
        readOnly={!enabled || agent.archived}
        composerExtra={v2 && onOpenAccess ? (draft) => (
          <AgentPlanSlot api={agents} agent={agent} text={draft.text} attachments={draft.attachments} enabled={enabled && !agent.archived && active} onOpenAccess={onOpenAccess} />
        ) : undefined}
        renderTool={(tool, turn) =>
          tool.approval ? (
            <AgentDecision
              key={tool.id}
              tool={tool}
              turn={turn}
              api={decisions}
              accounts={accounts}
              store={store}
              enabled={enabled && !agent.archived && active}
            />
          ) : null
        }
      />
    </VibesStoreProvider>
  );
}
