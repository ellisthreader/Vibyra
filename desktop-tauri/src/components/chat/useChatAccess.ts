import { useState } from 'react';
import { chatRequest, type ConversationSnapshot } from '../../ipc/sharedChats';

export type AccessLevel = 'ask' | 'auto' | 'full';
export const ACCESS_LEVELS: AccessLevel[] = ['ask', 'auto', 'full'];

/** The words for each level, said for the provider that will act on them. */
export function accessWords(level: AccessLevel, provider: string) {
  const codex = provider === 'codex';
  return {
    ask: { label: 'Ask first', hint: codex ? 'Asks before running commands outside a short safe list' : 'Asks before it edits a file or runs a command' },
    auto: { label: 'Auto', hint: codex ? 'Edits and runs commands in a sandbox for this project; asks to go outside it' : 'Edits files in this project; asks before running commands' },
    full: { label: 'Full access', hint: 'Edits and runs anything on this Mac without asking' },
  }[level];
}

/** What a chat launched with, for chats saved before levels existed (mirrors the Host). */
function launched(settings: ConversationSnapshot['settings'] | undefined): AccessLevel {
  const value = (settings as { access?: string } | undefined)?.access;
  if (value === 'ask' || value === 'auto' || value === 'full') return value;
  if (settings?.approvalPolicy === 'never') return 'full';
  return !settings?.provider || settings.provider === 'codex' ? 'auto' : 'ask';
}

/**
 * The chat's access level and the one way to change it: the Host's Mac-only
 * `conversation.access`, applied from the next message.
 */
export function useChatAccess(sessionId: string, snapshot: ConversationSnapshot | null) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const level = launched(snapshot?.settings);
  const choose = async (next: AccessLevel) => {
    if (next === level) return true;
    setSaving(true); setError('');
    try {
      await chatRequest('conversation.access', { sessionId, requestId: crypto.randomUUID(), revision: snapshot?.settings?.revision ?? 0, access: next });
      return true;
    } catch (cause) { setError(String(cause)); return false; }
    finally { setSaving(false); }
  };
  return { level, provider: snapshot?.settings?.provider ?? 'codex', live: snapshot?.processState === 'running', saving, error, choose };
}
export type ChatAccess = ReturnType<typeof useChatAccess>;
