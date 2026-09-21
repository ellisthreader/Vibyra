import { useState } from 'react';
import { chatRequest, type SharedSession } from '../../ipc/sharedChats';
import { useConversationTerminals } from '../../state/conversationTerminalStore';
import { AgentMark } from '../common/AgentMark';
import { conversationAgent } from '../../lib/conversationAgent';
import { ExpandIcon } from '../common/Icons';
import { CloseSessionButton } from './CloseSessionButton';
import { ConversationCliView } from './ConversationCliView';
import { ResumeConversation } from './ResumeConversation';
import { useSettingsStore } from '../../state/settingsStore';

export function NativeConversationPane({ session, hidden, active, fontSize }: {
  session: SharedSession; hidden: boolean; active: boolean; fontSize: number;
}) {
  const terminals = useConversationTerminals();
  const [error, setError] = useState('');
  const agent = conversationAgent(session.kind);
  const running = session.status === 'running';
  const close = async () => {
    try {
      if (running) await chatRequest('session.stop', { sessionId: session.id });
      terminals.dismiss(session.id); await terminals.refresh();
    } catch (e) { setError(String(e)); }
  };
  return <section id={`cli-${session.id}`} data-agent-view="terminal" aria-label={`${session.title} terminal`}
    className={`pane conversation-cli ${hidden ? 'pane--hidden' : ''} ${terminals.focused === session.id ? 'pane--focused' : ''}`}>
    <header className="pane__header"><AgentMark agentId={agent.id} name={agent.name} accent={agent.accent} size={18} />
      <span className="pane__title"><strong>{session.title}</strong></span>
      <div className="pane__actions"><button className="icon-btn" aria-label={terminals.zoomed === session.id ? 'Restore grid' : 'Expand terminal'} onClick={() => terminals.toggleZoom(session.id)}><ExpandIcon size={14} /></button>
        <CloseSessionButton active={active && !hidden} onClose={close} /></div>
    </header>
    {error && <p role="alert" className="shared-error">{error}</p>}
    {running ? <ConversationCliView sessionId={session.id} visible={active && !hidden} fontSize={fontSize}
      onFocus={() => useConversationTerminals.setState({ focused: session.id })} /> : <>
      <ResumeConversation sessionId={session.id} />
      <div className="conversation-cli-error"><span>Your conversation and project files are saved. Resume this terminal to continue the same work.</span>
        <button className="btn" onClick={() => void useSettingsStore.getState().update({ agentView: 'chat' }).catch(e => setError(String(e)))}>View saved chat</button></div>
    </>}
  </section>;
}
