import { SpeakReply, useDraftDictation } from '../companion/ChatVoice';
import { ResumeConversation } from './ResumeConversation';
import { useEffect, useRef, useState } from 'react';
import { chatRequest, type SharedSession, type ConversationSnapshot, type AgentItem } from '../../ipc/sharedChats';
import { useConversationTerminals } from '../../state/conversationTerminalStore';
import { useSettingsStore } from '../../state/settingsStore';
import { conversationViewMemory } from '../../../../mobile/src/conversation/viewMemory';
import { ConversationAttachments } from '../sharedChats/ConversationAttachments';
import type { ConversationAttachment } from '../../../../mobile/src/conversation/attachmentUpload';
import { hasLiveActivity, turnSummary } from '../../../../mobile/src/conversation/turnSummary';
import { InlineCommands } from '../sharedChats/InlineCommands';
import { ConversationControls } from '../sharedChats/ConversationControls';
import { ActivityTimeline } from '../sharedChats/ActivityTimeline';
import { ConversationInspector } from '../sharedChats/ConversationInspector';
import { changedFiles, operationLabel, parseCommand, type CommandCatalogue, type InspectorMode } from '../../../../mobile/src/conversation/inspection';
import { ChatItem } from '../sharedChats/ChatItem';
import { useSharedChat } from '../sharedChats/useSharedChat';
import { AgentMark } from '../common/AgentMark';
import { conversationAgent } from '../../lib/conversationAgent';
import { ExpandIcon } from '../common/Icons';
import { CloseSessionButton } from './CloseSessionButton';
import '../sharedChats/sharedChats.css';
import './conversationTerminal.css';
import '../sharedChats/conversationInspector.css';
import '../sharedChats/conversationComposer.css';

export function ConversationChatPane({ session, hidden, active, fontSize }: {
  session: SharedSession; hidden: boolean; active: boolean; fontSize: number;
}) {
  const { snapshot, error, busy, connected, run, send } = useSharedChat(session.id, active && !hidden);
  const agent = conversationAgent(session.kind);
  const terminals = useConversationTerminals();
  const fontFamily = useSettingsStore(state => state.settings?.fontFamily);
  const draftKey = `shared.draft.${session.id}`;
  const [draft, setDraft] = useState(() => localStorage.getItem(draftKey) ?? '');
  const [commandPanel, setCommandPanel] = useState<InspectorMode | null>(null);
  const [inspector, setInspector] = useState<{ mode: InspectorMode; item?: AgentItem } | null>(null);
  const [attachments, updateAttachments] = useState<ConversationAttachment[]>(() => {
    try { return JSON.parse(localStorage.getItem(`${draftKey}.attachments`) ?? '[]'); } catch { return []; }
  });
  const setAttachments = (value: ConversationAttachment[]) => { updateAttachments(value); try { localStorage.setItem(`${draftKey}.attachments`, JSON.stringify(value)); } catch { setDraftError('Attachment selections could not be saved.'); } };
  const [commandError, setCommandError] = useState('');
  const [showLatest, setShowLatest] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [earlier, setEarlier] = useState<AgentItem[]>([]);
  const [more, setMore] = useState(true);
  const scroll = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const memory = conversationViewMemory(session.id);
  useEffect(() => { if (memory.selection) input.current?.setSelectionRange(memory.selection.start, memory.selection.end); }, [session.id]);
  const stick = useRef(memory.following);
  const restoredScroll = useRef(false);
  const working = snapshot?.turnState === 'running' || snapshot?.turnState === 'waiting';
  const ready = connected && snapshot?.processState === 'running';
  const latestIds = new Set(snapshot?.items.map(item => item.id));
  const items = [...earlier.filter(item => !latestIds.has(item.id)), ...(snapshot?.items ?? [])];
  const stateLabel = !connected ? 'Connecting…' : !ready ? 'Saved' : snapshot?.turnState === 'waiting'
    ? 'Needs input' : working ? 'Running' : snapshot?.turnState === 'failed' ? 'Failed' : 'Ready';
  useEffect(() => {
    if (!snapshot || !scroll.current) return;
    if (!restoredScroll.current && !memory.following) scroll.current.scrollTop = memory.offset;
    else if (stick.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    restoredScroll.current = true;
  }, [snapshot]);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver(() => { if (stick.current) element.scrollTop = element.scrollHeight; });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => { if (terminals.focused === session.id && active && !hidden) input.current?.focus(); }, [terminals.focused, session.id, active, hidden]);
  const edit = (value: string) => {
    setDraft(value);
    try { localStorage.setItem(draftKey, value); setDraftError(''); } catch { setDraftError('This draft could not be saved on this device.'); }
  };
  const voice = useDraftDictation(`conversation:${session.id}`, active && !hidden && !busy, text => edit([draft, text].filter(Boolean).join(' ')));
  const openInspector = (mode: InspectorMode, item?: AgentItem) => setInspector({ mode, item });
  const submit = async (asText = false, text = draft) => {
    if (busy || !connected) return;
    if (!asText && text.trimStart().startsWith('/')) {
      try {
        const catalogue = await chatRequest<CommandCatalogue>('conversation.commands', { sessionId: session.id });
        const command = parseCommand(text, catalogue);
        if (!command?.supported) { setCommandError(command?.reason ?? 'Unknown command'); return; }
        if (command.args && (command.name === 'model' || command.name === 'effort')) {
          const { models } = await chatRequest<{ models: import('../../../../mobile/src/conversation/inspection').ModelChoice[] }>('conversation.models', { sessionId: session.id });
          const model = models.find(model => model.model === (command.name === 'model' ? command.args : snapshot?.settings?.model));
          if (!model) { setCommandError('Choose an available account model.'); return; }
          await chatRequest('conversation.settings', { sessionId: session.id, requestId: crypto.randomUUID(), revision: snapshot?.settings?.revision ?? 0,
            model: model.model, effort: command.name === 'effort' ? command.args : model.defaultReasoningEffort });
          edit(''); setCommandError(''); return;
        }
        if (command.args) { setCommandError('This command does not accept arguments.'); return; }
        if (command.name === 'stop') await run(() => chatRequest('turn.interrupt', { sessionId: session.id, turnId: snapshot?.turnId }));
        else setCommandPanel(command.name as InspectorMode);
        edit(''); setCommandError('');
      } catch (error) { setCommandError(String(error)); }
      return;
    }
    if (working || !ready) return;
    if (await send(draft, asText, attachments.map(a => a.id))) { edit(''); setAttachments([]); setCommandError(''); stick.current = true; }
  };
  const groups: AgentItem[][] = [];
  for (const item of items) {
    const previous = groups.at(-1);
    if (item.kind === 'activity' && previous?.[0].kind === 'activity' && previous[0].turnId === item.turnId) previous.push(item);
    else groups.push([item]);
  }
  const files = changedFiles(items, snapshot?.turnId);
  const jump = () => { stick.current = true; setShowLatest(false); scroll.current?.scrollTo({ top: scroll.current.scrollHeight }); };
  const close = async () => {
    if (snapshot?.processState === 'running' || session.status === 'running') {
      if (!await run(() => chatRequest('session.stop', { sessionId: session.id }))) return;
    }
    terminals.dismiss(session.id);
    void terminals.refresh();
  };
  return <section id={`conversation-${session.id}`} data-agent-view="chat" className={`pane conversation-terminal ${hidden ? 'pane--hidden' : ''} ${terminals.focused === session.id ? 'pane--focused' : ''}`}
    aria-label={`${session.title} terminal`} style={{ '--conversation-font': `${fontSize}px`, '--conversation-mono': fontFamily } as React.CSSProperties}>
    <header className="pane__header">
      <AgentMark agentId={agent.id} name={agent.name} accent={agent.accent} size={18} />
      <span className="pane__title" title={snapshot?.workingDirectory ?? session.title}><strong>{session.title}</strong></span>
      <span className="pane__state" role="status">{stateLabel}</span>
      {files.length > 0 && <button className="conversation-changes-button" onClick={() => openInspector('diff')}>Changes <span>{files.length}</span></button>}
      <button className="icon-btn" aria-label="Conversation details" onClick={() => openInspector('status')}>···</button>
      <div className="pane__actions">
        <button className="icon-btn" aria-label={terminals.zoomed === session.id ? 'Restore grid' : 'Expand terminal'} onClick={() => terminals.toggleZoom(session.id)}><ExpandIcon size={14} /></button>
        <CloseSessionButton disabled={busy} active={active && !hidden} onClose={close} />
      </div>
    </header>
    {session.status !== 'running' && (session.kind ?? 'codex') === 'codex' && <ResumeConversation sessionId={session.id} />}
    <div className="conversation-body"><div className="conversation-reading">
    <div ref={scroll} className="shared-transcript" onScroll={() => { const el = scroll.current!; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; setShowLatest(!stick.current); memory.following = stick.current; memory.offset = el.scrollTop; }}>
      {snapshot?.hasMore && more && <button className="btn" disabled={busy} onClick={() => void run(async () => {
        const page = await chatRequest<ConversationSnapshot>('conversation.snapshot', { sessionId: session.id,
          beforeCursor: Math.min(...items.map(item => item.order ?? item.cursor ?? Infinity)) });
        setEarlier(old => [...page.items, ...old]); setMore(page.hasMore);
      })}>Load earlier output</button>}
      {!snapshot ? <p className="shared-result">Loading conversation…</p> : !items.length && <div className="conversation-welcome"><AgentMark agentId={agent.id} name={agent.name} accent={agent.accent} size={30} /><h2>What shall we build?</h2><p>A small fix, a fresh idea, or the next step.</p></div>}
      {groups.map(group => group[0].kind === 'activity' ? <ActivityTimeline memoryKey={session.id} key={group[0].id} items={group} onInspect={item => openInspector(item.category === 'fileChange' ? 'diff' : 'context', item)} />
        : <div key={group[0].id} data-request={group[0].status === 'pending' ? group[0].id : undefined}><ChatItem item={group[0]} summary={turnSummary(items, group[0].turnId)} sessionId={session.id} disabled={!ready || busy} run={run} onInspect={item => openInspector('context', item)} />{group[0].kind === 'message' && group[0].role === 'assistant' && group[0].status === 'completed' && group[0].text && <SpeakReply text={group[0].text} active={active && !hidden} />}</div>)}
      {working && !hasLiveActivity(items) && <p className="shared-live" role="status"><span className="activity-dot is-active" />{operationLabel(items, snapshot?.turnState === 'waiting')}</p>}
    </div>
    {showLatest && <button className="conversation-jump" onClick={() => {
      const request = scroll.current?.querySelector('[data-request]');
      if (request) request.scrollIntoView({ block: 'center' }); else jump();
    }}>{items.some(i => i.status === 'pending') ? 'Jump to request' : 'Latest activity'} ↓</button>}
    <footer className="shared-compose-wrap">
      {(error || draftError) && <p role="alert" className="shared-error">{error || draftError}</p>}
      {snapshot && !ready && snapshot.processState !== 'running' && (session.kind ?? 'codex') !== 'codex' && <p className="shared-result">Saved output. Use New terminal to start another task.</p>}
      {commandError && <div className="conversation-command-error" role="alert"><span>{commandError}</span><button className="conversation-text-button" onClick={() => openInspector('help')}>Commands</button><button className="conversation-text-button" disabled={working || busy} onClick={() => void submit(true)}>Send as text</button></div>}
      {draft.trimStart().startsWith('/') ? <InlineCommands sessionId={session.id} draft={draft} onChoose={command => void submit(false, command)} />
        : commandPanel && <ConversationInspector inline mode={commandPanel} session={session} snapshot={snapshot} items={items} run={run} onClose={() => setCommandPanel(null)} onMode={setCommandPanel} />}
      <form className={`terminal-prompt ${working ? 'is-working' : ''}`} onSubmit={event => { event.preventDefault(); void submit(); }}>
        <textarea ref={input} aria-label={`Message ${agent.name}`} placeholder={working ? 'Draft your next message…' : 'Ask anything, or / for commands…'} value={draft} disabled={busy} rows={2}
          onSelect={event => { memory.selection = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd }; }}
          onFocus={() => { useConversationTerminals.setState({ focused: session.id }); voice.focus(); }}
          onChange={event => { edit(event.target.value); setCommandError(''); }} onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); }
          }} />
        <div className="conversation-composer-toolbar"><div className="conversation-composer-tools">
          {voice.button}
          <ConversationAttachments sessionId={session.id} attachments={attachments} onChange={setAttachments} disabled={!ready || busy} />
          <button type="button" className="conversation-tool" aria-label="Open commands" onClick={() => { edit('/'); input.current?.focus(); }}> /</button>
          <ConversationControls sessionId={session.id} snapshot={snapshot} disabled={!ready || busy} />
          {(snapshot?.settings?.sandbox as { type?: string } | undefined)?.type === 'dangerFullAccess' && <button type="button" className="conversation-full-access" onClick={() => openInspector('permissions')}>Full access</button>}
        </div>
        {working && !draft.startsWith('/') ? <button type="button" className="conversation-send" aria-label="Stop AI reply" disabled={!ready || busy || !snapshot?.turnId} onClick={() => void run(() => chatRequest('turn.interrupt', { sessionId: session.id, turnId: snapshot?.turnId }))}>■</button>
          : <button className="conversation-send" aria-label="Send message" disabled={!ready || busy || !draft.trim()}>{busy ? '…' : '↑'}</button>}</div>
      </form>
    </footer></div>
    {inspector && <ConversationInspector key={`${session.id}:${inspector.mode}:${inspector.item?.id ?? ''}`} mode={inspector.mode} selected={inspector.item} session={session} snapshot={snapshot} items={items} run={run} onClose={() => setInspector(null)} onMode={openInspector} />}
    </div>
  </section>;
}
