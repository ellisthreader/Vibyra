import { useEffect, useState } from 'react';
import { chatRequest, type SharedSession } from '../../ipc/sharedChats';
import { useConversationTerminals } from '../../state/conversationTerminalStore';
import { useSettingsStore } from '../../state/settingsStore';
import { LaunchSettingsPanel } from '../rail/LaunchSettings';
import { ChatThreadTabs } from './ChatThreadTabs';
import { ConversationTerminalPane } from './ConversationTerminalPane';
import './chatThreads.css';

/**
 * Chat view's workspace: one chat filling the page, with the project's open
 * chats as tabs above it. Every open chat stays mounted (hidden) so drafts,
 * scroll and live streams survive switching; terminals stay in Terminal view.
 */
export function ChatThreadStage({ projectId, active, fontSize, terminals }: {
  projectId: string | null; active: boolean; fontSize: number; terminals: number;
}) {
  const conversations = useConversationTerminals();
  const all = conversations.sessions.filter(s => s.projectId === projectId);
  const threads = all.filter(s => conversations.open.includes(s.id))
    .sort((a, b) => conversations.open.indexOf(a.id) - conversations.open.indexOf(b.id));
  const history = all.filter(s => !conversations.open.includes(s.id))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const current = threads.find(s => s.id === conversations.focused)?.id ?? threads.at(-1)?.id ?? null;
  const [composing, setComposing] = useState(false);
  // A chat that opens (from +, History, the phone or a company switch) replaces the new-chat page.
  useEffect(() => { setComposing(false); }, [conversations.focused, threads.length]);
  const select = (id: string) => { setComposing(false); useConversationTerminals.setState({ focused: id, zoomed: null }); };
  const close = async (session: SharedSession) => {
    try {
      if (session.status === 'running') await chatRequest('session.stop', { sessionId: session.id });
      const store = useConversationTerminals.getState();
      if (store.focused === session.id) {
        const index = threads.findIndex(s => s.id === session.id);
        useConversationTerminals.setState({ focused: (threads[index + 1] ?? threads[index - 1])?.id ?? null });
      }
      store.dismiss(session.id);
      void store.refresh();
    } catch (error) { useConversationTerminals.setState({ error: String(error) }); }
  };
  const showLauncher = composing || !threads.length;
  return <div className="chat-threads">
    <ChatThreadTabs threads={threads} history={history} active={current} composing={showLauncher && threads.length > 0} terminals={terminals}
      onSelect={select} onClose={session => void close(session)} onNew={() => setComposing(true)}
      onReopen={id => useConversationTerminals.getState().reveal(id)}
      onTerminals={() => void useSettingsStore.getState().update({ agentView: 'terminal' })} />
    <div className="chat-threads__page">
      {showLauncher && <div className="chat-threads__launch"><LaunchSettingsPanel chat /></div>}
      {threads.map(session => <div key={session.id} className="chat-threads__thread" hidden={showLauncher || session.id !== current}>
        <ConversationTerminalPane session={session} hidden={showLauncher || session.id !== current} active={active} fontSize={fontSize} threaded />
      </div>)}
    </div>
  </div>;
}
