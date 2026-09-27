import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { chatRequest } from '../../ipc/sharedChats';
import { useConversationTerminals } from '../../state/conversationTerminalStore';
import { useTerminalStore } from '../../state/terminalStore';
import { useAccountStore } from '../../state/accountStore';
import { usePageVisible } from '../../lib/usePageVisible';
import type { TreeChanges, TreeSession, WorktreeInventory } from './types';

/** Bounded concurrency and a delay after completion, rather than overlapping polls. */
async function mapLimited<T, R>(items: T[], action: (item: T) => Promise<R>, alive: () => boolean) {
  let cursor = 0;
  const result: R[] = [];
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (cursor < items.length && alive()) { const index = cursor++; result[index] = await action(items[index]); }
  }));
  return result;
}

export function useWorktrees(root: string | null, projectId: string | null, active: boolean) {
  const account = useAccountStore(s => s.snapshot.profile?.email ?? 'guest');
  const [result, setResult] = useState<{ key: string; inventory: WorktreeInventory; changes: Record<string, TreeChanges>; sessions: TreeSession[] } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [revision, refresh] = useState(0);
  const key = JSON.stringify([account, projectId, root]);
  const visible = usePageVisible();
  useEffect(() => {
    if (!root || !active || !visible) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const inventory = await invoke<WorktreeInventory>('workspace_worktrees', { root });
        const sharedState = useConversationTerminals.getState();
        const shared = sharedState.sessions.filter(s => s.projectId === projectId && sharedState.open.includes(s.id));
        const sessions = await mapLimited(shared, async session => {
          try {
            const status = await chatRequest<{ workingDirectory: string; turnState: string; processState: string }>('conversation.status', { sessionId: session.id });
            const state = status.turnState === 'running' ? 'working' : ['waiting', 'failed', 'waiting_approval', 'waiting_input'].includes(status.turnState) ? 'attention' : 'idle';
            return { id: session.id, title: session.title, directory: status.workingDirectory, state };
          } catch { return null; }
        }, () => alive);
        const changes: Record<string, TreeChanges> = {};
        await mapLimited(inventory.worktrees.filter(t => !t.isMain), async tree => {
          try {
            if (!tree.available) throw new Error('Working folder is unavailable.');
            const data = await invoke<{ files: { status: string }[] }>('fs_changes', { root: tree.directory });
            changes[tree.root] = { count: data.files.length, conflict: data.files.some(f => f.status.includes('U') || ['AA', 'DD'].includes(f.status)), error: '' };
          } catch (error) { changes[tree.root] = { count: null, conflict: false, error: String(error) }; }
        }, () => alive);
        if (alive) { setResult({ key, inventory, changes, sessions: sessions.filter((s): s is TreeSession => Boolean(s)) }); setFailure(null); }
      } catch (error) { if (alive) setFailure({ key, message: String(error) }); }
      if (alive) timer = setTimeout(poll, 6000);
    };
    void poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [key, active, visible, revision, root, projectId]);
  const panes = useTerminalStore(s => s.panes);
  const activity = useTerminalStore(s => s.activity);
  const data = result?.key === key ? result : null;
  const sessions: TreeSession[] = [...(data?.sessions ?? []), ...panes.filter(p => p.projectId === projectId && p.resumeCwd).map(p => ({
    id: String(p.id), title: p.customTitle ?? p.title, directory: p.resumeCwd!,
    state: p.status === 'running' ? activity[p.id] ?? 'idle' : 'idle',
  }))];
  return { inventory: data?.inventory ?? null, changes: data?.changes ?? {}, sessions,
    error: failure?.key === key ? failure.message : '', refresh: () => refresh(n => n + 1) };
}
