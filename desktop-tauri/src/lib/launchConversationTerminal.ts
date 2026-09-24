import { createSharedChat, lookupSharedChatCreate, type ConversationLaunchOptions } from '../ipc/sharedChats';
import { useConversationTerminals } from '../state/conversationTerminalStore';

const launching = new Set<string>();
/** Resolves to the shared chat's id once it is in the grid. */
export async function launchConversationTerminal(projectId: string, accountId: string | null,
  title: string, options: ConversationLaunchOptions): Promise<string> {
  const key = `terminal.create.${projectId}.${options.provider ?? 'codex'}.${accountId ?? 'default'}`;
  if (launching.has(key)) throw new Error('This terminal is still starting.');
  launching.add(key);
  try {
    const payload = { title, options };
    const saved = localStorage.getItem(key);
    const request = saved ? JSON.parse(saved) as typeof payload & { requestId: string } : { requestId: crypto.randomUUID(), ...payload };
    const identity = (value: typeof payload) => JSON.stringify({ title: value.title,
      options: { ...value.options, safeSnapshotFingerprint: undefined } });
    if (identity(request) !== identity(payload)) {
      // The old IPC reply may have been lost. Inspect its native receipt without
      // dispatching the old settings again, then give this click a fresh ID.
      if (typeof request.requestId !== 'string') throw new Error('The saved terminal launch receipt is damaged.');
      const old = await lookupSharedChatCreate(projectId, accountId ?? 'default',
        options.provider ?? 'codex', request.requestId);
      localStorage.removeItem(key);
      if (old) {
        const store = useConversationTerminals.getState();
        await store.refresh(); store.reveal(old.id);
      }
      return launchAfterRecovery(projectId, accountId, title, options, key);
    }
    localStorage.setItem(key, JSON.stringify(request));
    const session = await createSharedChat(projectId, accountId ?? 'default', request.requestId, request.title,
      { ...request.options, safeSnapshotFingerprint: options.safeSnapshotFingerprint });
    // A lost reply is reconciled with the same request ID, never another execution.
    localStorage.removeItem(key);
    const store = useConversationTerminals.getState();
    await store.refresh(); store.reveal(session.id);
    return session.id;
  } finally { launching.delete(key); }
}

async function launchAfterRecovery(projectId: string, accountId: string | null, title: string,
  options: ConversationLaunchOptions, key: string): Promise<string> {
  const requestId = crypto.randomUUID();
  localStorage.setItem(key, JSON.stringify({ requestId, title, options }));
  const session = await createSharedChat(projectId, accountId ?? 'default', requestId, title, options);
  localStorage.removeItem(key);
  const store = useConversationTerminals.getState();
  await store.refresh(); store.reveal(session.id);
  return session.id;
}
