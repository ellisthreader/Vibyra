import { useRef, useState } from 'react';
import { chatRequest } from '../../ipc/sharedChats';
import { useConversationTerminals } from '../../state/conversationTerminalStore';

/** Resume only on an explicit click; never submit a prompt or create a replacement chat. */
export function ResumeConversation({ sessionId }: { sessionId: string }) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const resume = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      await chatRequest('conversation.resume', { sessionId });
      await useConversationTerminals.getState().refresh();
    } catch (error) {
      const message = String(error);
      setError(/no rollout found for thread id/i.test(message)
        ? 'Codex cannot find this terminal’s saved thread. Your Vibyra history and project files are still here. Start a new terminal for new work.'
        : message);
    }
    finally { pending.current = false; setBusy(false); }
  };
  return <div className="conversation-cli-error">
    <span>Saved conversation</span><button className="btn" disabled={busy} onClick={() => void resume()}>{busy ? 'Resuming…' : 'Resume Codex'}</button>
    {error && <span role="alert">{error}</span>}
  </div>;
}
