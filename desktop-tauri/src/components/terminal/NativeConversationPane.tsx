import { AgentLogo } from '../common/AgentLogo';
import { useState } from 'react';
import { chatRequest, type SharedSession } from '../../ipc/sharedChats';
import { useConversationTerminals } from '../../state/conversationTerminalStore';
import { useTerminalStore } from '../../state/terminalStore';
import { agentIdentity } from '../../lib/agentIdentity';
import { conversationAgent } from '../../lib/conversationAgent';
import { ExpandIcon } from '../common/Icons';
import { CloseSessionButton } from './CloseSessionButton';
import { ConversationCliView } from './ConversationCliView';
import { ResumeConversation } from './ResumeConversation';

export function NativeConversationPane({ session, hidden, active, fontSize, onOpenChat }: {
  session: SharedSession; hidden: boolean; active: boolean; fontSize: number; onOpenChat: () => void;
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
    <header className="pane__header"><AgentLogo agentId={agent.id} name={agentIdentity(agent.id).name} size={22} className="pane__tile" />
      <span className="pane__title"><strong>{session.title}</strong></span>
      <span className="pane__meta">{agent.name}</span>
      <span className={`sb-pill sb-pill--${running ? 'working' : 'quiet'} pane__state`}>{running ? 'Running' : 'Saved'}</span>
      <div className="pane__actions"><button className="icon-btn" aria-label={terminals.zoomed === session.id ? 'Restore grid' : 'Expand terminal'} onClick={() => terminals.toggleZoom(session.id)}><ExpandIcon size={14} /></button>
        <CloseSessionButton active={active && !hidden} onClose={close} /></div>
    </header>
    {error && <p role="alert" className="shared-error">{error}</p>}
    {running ? <ConversationCliView sessionId={session.id} visible={active && !hidden} fontSize={fontSize} onOpenChat={onOpenChat}
      onFocus={() => { useTerminalStore.setState({ focusedId: null }); useConversationTerminals.setState({ focused: session.id }); }} /> : <>
      <ResumeConversation sessionId={session.id} />
      <div className="conversation-cli-error"><span>Your conversation and project files are saved. Resume this terminal or view its saved chat.</span>
        <button className="btn" onClick={onOpenChat}>View saved chat</button></div>
    </>}
  </section>;
}
