import { createSharedChat, type ConversationLaunchOptions } from '../ipc/sharedChats';
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
    const request = saved ? JSON.parse(saved) : { requestId: crypto.randomUUID(), ...payload };
    const identity = (value: typeof payload) => JSON.stringify({ title: value.title,
      options: { ...value.options, safeSnapshotFingerprint: undefined } });
    if (identity(request) !== identity(payload)) {
      throw new Error('A previous terminal launch needs checking. Retry with its original settings first.');
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
