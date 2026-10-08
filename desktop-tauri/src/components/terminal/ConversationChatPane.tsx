import { AgentLogo } from '../common/AgentLogo';
import { useDraftDictation } from '../companion/ChatVoice';
import { ResumeConversation } from './ResumeConversation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chatRequest, type SharedSession, type ConversationSnapshot, type AgentItem } from '../../ipc/sharedChats';
import { useConversationTerminals } from '../../state/conversationTerminalStore';
import { useTerminalStore } from '../../state/terminalStore';
import { useSettingsStore } from '../../state/settingsStore';
import { conversationViewMemory } from '../../../../mobile/src/conversation/viewMemory';
import { ConversationAttachments } from '../sharedChats/ConversationAttachments';
import type { ConversationAttachment } from '../../../../mobile/src/conversation/attachmentUpload';
import { ConversationInspector } from '../sharedChats/ConversationInspector';
import { changedFiles, type InspectorMode } from '../../../../mobile/src/conversation/inspection';
import { useSharedChat } from '../sharedChats/useSharedChat';
import { ChatTranscript } from '../chat/ChatTranscript';
import { ChatComposer } from '../chat/ChatComposer';
import { ChatArrowDownIcon } from '../chat/chatIcons';
import { useChatModels } from '../chat/useChatModels';
import { useChatCommands } from '../chat/useChatCommands';
import { ChatControls, type ChatMenu } from '../chat/ChatControls';
import { useChatAccess } from '../chat/useChatAccess';
import { useCompanyModels } from '../chat/useCompanyModels';
import { HANDOFF_EVENT, handoffBrief, switchCompany } from '../chat/chatHandoff';
import { ChatCommandMenu } from '../chat/ChatCommandMenu';
import { conversationAgent } from '../../lib/conversationAgent';
import { agentIdentity } from '../../lib/agentIdentity';
import { ExpandIcon } from '../common/Icons';
import { CloseSessionButton } from './CloseSessionButton';
import '../sharedChats/sharedChats.css';
import './conversationTerminal.css';
import '../sharedChats/conversationInspector.css';
import '../sharedChats/conversationComposer.css';
import '../chat/chat.css';
import '../chat/chatPickers.css';

export function ConversationChatPane({ session, hidden, active, fontSize, onReturnTerminal, threaded = false }: {
  session: SharedSession; hidden: boolean; active: boolean; fontSize: number; onReturnTerminal?: () => void;
  /** One thread of Chat view's full-page chat: its tab names and closes it, so the header keeps only its tools. */
  threaded?: boolean;
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
  const [picker, setPicker] = useState<ChatMenu | null>(null);
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
  // Derived once per transcript change, not per keystroke: every draft edit
  // re-renders this pane, and memoised rows only hold with stable inputs.
  const items = useMemo(() => {
    const latestIds = new Set(snapshot?.items.map(item => item.id));
    return [...earlier.filter(item => !latestIds.has(item.id)), ...(snapshot?.items ?? [])];
  }, [earlier, snapshot?.items]);
  const stateLabel = !connected ? 'Connecting…' : !ready ? 'Saved' : snapshot?.turnState === 'waiting'
    ? 'Needs you' : working ? 'Working' : snapshot?.turnState === 'failed' ? 'Failed' : 'Ready';
  const stateTone = stateLabel === 'Needs you' || stateLabel === 'Failed' ? 'attention' : stateLabel === 'Working' ? 'working' : 'quiet';
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
  const openInspector = useCallback((mode: InspectorMode, item?: AgentItem) => setInspector({ mode, item }), []);
  const inspectActivity = useCallback((item: AgentItem) => setInspector({ mode: item.category === 'fileChange' ? 'diff' : 'context', item }), []);
  const models = useChatModels(session.id, snapshot, session.kind);
  const companies = useCompanyModels();
  const access = useChatAccess(session.id, snapshot);
  useEffect(() => {
    const take = (event: Event) => { const detail = (event as CustomEvent<{ sessionId: string; text: string }>).detail; if (detail.sessionId === session.id) edit(detail.text); };
    window.addEventListener(HANDOFF_EVENT, take); return () => window.removeEventListener(HANDOFF_EVENT, take);
  }, [session.id]);
  // /help is the "/" menu itself; /model and /effort open the switcher.
  const openPanel = useCallback((mode: InspectorMode) => mode === 'model' || mode === 'effort' ? setPicker(mode)
    : mode === 'help' ? (setCommandPanel(null), setTimeout(() => { edit('/'); input.current?.focus(); })) : setCommandPanel(mode), []);
  const commands = useChatCommands({ session, snapshot, items, draft, models, working, ready, run, openPicker: setPicker, openPanel,
    send: text => send(text, false, []) });
  const submit = async (asText = false, text = draft) => {
    if (busy || !connected) return;
    if (!asText && text.trimStart().startsWith('/')) {
      try { if (await commands.execute(text)) edit(''); } catch (cause) { commands.setError(String(cause)); }
      return;
    }
    if (working || !ready) return;
    if (await send(text, asText, attachments.map(a => a.id))) { edit(''); setAttachments([]); commands.setError(''); stick.current = true; }
  };
  const openMenu = useCallback((menu: ChatMenu | null) => { setCommandPanel(null); setPicker(menu); if (!menu) input.current?.focus(); }, []);
  const menuKey = (event: React.KeyboardEvent) => {
    if (!commands.open) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { commands.move(event.key === 'ArrowDown' ? 1 : -1); return true; }
    if (event.key === 'Escape') { edit(''); return true; }
    if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey && commands.list.length)) {
      const item = commands.list[commands.active];
      // Tab completes a command that takes a choice ("/model "), Return runs the row.
      if (event.key === 'Tab') { if (item && !item.disabled) edit(item.group === 'arg' ? item.text : `${item.text} `); return true; }
      const text = commands.choose(item); if (text) void submit(false, text); return true;
    }
    return false;
  };
  const review = useCallback(() => setInspector({ mode: 'diff' }), []);
  const suggest = useCallback((text: string) => { edit(text); input.current?.focus(); }, []);
  const files = useMemo(() => changedFiles(items, snapshot?.turnId), [items, snapshot?.turnId]);
  const jump = () => { stick.current = true; setShowLatest(false); scroll.current?.scrollTo({ top: scroll.current.scrollHeight }); };
  const close = async () => {
    if (snapshot?.processState === 'running' || session.status === 'running') {
      if (!await run(() => chatRequest('session.stop', { sessionId: session.id }))) return;
    }
    terminals.dismiss(session.id);
    void terminals.refresh();
  };
  return <section id={`conversation-${session.id}`} data-agent-view="chat" className={`pane conversation-terminal ${threaded ? 'conversation-terminal--threaded' : ''} ${hidden ? 'pane--hidden' : ''} ${terminals.focused === session.id ? 'pane--focused' : ''}`}
    aria-label={`${session.title} terminal`} style={{ '--conversation-font': `${fontSize}px`, '--conversation-mono': fontFamily } as React.CSSProperties}>
    <header className="pane__header">
      {!threaded && <AgentLogo agentId={agent.id} name={agentIdentity(agent.id).name} size={22} className="pane__tile" />}
      {!threaded && <span className="pane__title" title={snapshot?.workingDirectory ?? session.title}><strong>{session.title}</strong></span>}
      {!threaded && agent.name !== session.title && <span className="pane__meta">{agent.name}</span>}
      <span className={`sb-pill sb-pill--${stateTone} pane__state`} role="status">{stateLabel}</span>
      {onReturnTerminal && <button className="btn" onClick={onReturnTerminal}>Back to Terminal</button>}
      {files.length > 0 && <button className="conversation-changes-button" onClick={() => openInspector('diff')}>Changes <span>{files.length}</span></button>}
      <button className="icon-btn" aria-label="Conversation details" onClick={() => openInspector('status')}>···</button>
      {!threaded && <div className="pane__actions">
        <button className="icon-btn" aria-label={terminals.zoomed === session.id ? 'Restore grid' : 'Expand terminal'} onClick={() => terminals.toggleZoom(session.id)}><ExpandIcon size={14} /></button>
        <CloseSessionButton disabled={busy} active={active && !hidden} onClose={close} />
      </div>}
    </header>
    <div className="conversation-body"><div className="conversation-reading">
    <div ref={scroll} className="shared-transcript" onScroll={() => { const el = scroll.current!; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; setShowLatest(!stick.current); memory.following = stick.current; memory.offset = el.scrollTop; }}>
      {snapshot?.hasMore && more && <button className="btn" disabled={busy} onClick={() => void run(async () => {
        const page = await chatRequest<ConversationSnapshot>('conversation.snapshot', { sessionId: session.id,
          beforeCursor: Math.min(...items.map(item => item.order ?? item.cursor ?? Infinity)) });
        setEarlier(old => [...page.items, ...old]); setMore(page.hasMore);
      })}>Load earlier messages</button>}
      {!snapshot ? <p className="chat-loading" role="status"><span className="chat-spinner" />Opening this chat…</p>
        : <ChatTranscript sessionId={session.id} agent={agent} items={items} turnId={snapshot.turnId} working={working}
          waiting={snapshot.turnState === 'waiting'} active={active && !hidden} disabled={!ready || busy} run={run}
          onInspect={inspectActivity} onReview={review} onSuggest={ready ? suggest : undefined} />}
    </div>
    {showLatest && <button className="conversation-jump" onClick={() => {
      const request = scroll.current?.querySelector('[data-request]');
      if (request) request.scrollIntoView({ block: 'center' }); else jump();
    }}><ChatArrowDownIcon size={13} />{items.some(i => i.status === 'pending') ? 'Jump to request' : 'Latest activity'}</button>}
    <footer className="shared-compose-wrap">
      {session.status !== 'running' && (session.kind ?? 'codex') === 'codex' && <ResumeConversation sessionId={session.id} agentName={agent.name} />}
      {(error || draftError) && <p role="alert" className="shared-error">{error || draftError}</p>}
      {snapshot && !ready && snapshot.processState !== 'running' && (session.kind ?? 'codex') !== 'codex' && <p className="shared-result">This chat has ended. Type <strong>/new</strong> to start a fresh one with the same AI.</p>}
      {commands.error && <div className="conversation-command-error" role="alert"><span>{commands.error}</span><button className="conversation-text-button" onClick={() => { commands.setError(''); edit('/'); input.current?.focus(); }}>All commands</button>{draft.trimStart().startsWith('/') && <button className="conversation-text-button" disabled={working || busy || !ready} onClick={() => void submit(true)}>Send as text</button>}</div>}
      {commands.notice && <p className="chat-command-notice" role="status">{commands.notice}</p>}
      {commands.open && !picker ? <ChatCommandMenu items={commands.list} active={commands.active} loading={commands.loading} error={commands.loadError}
        query={draft.trimStart().slice(1)} onHover={commands.setActive} onChoose={item => { const text = commands.choose(item); if (text) void submit(false, text); }} />
        : commandPanel && !picker && <ConversationInspector inline mode={commandPanel} session={session} snapshot={snapshot} items={items} run={run} onClose={() => setCommandPanel(null)} onMode={openPanel} />}
      <ChatComposer input={input} draft={draft} agentName={agent.name} working={working} busy={busy}
        canSend={ready && !busy && Boolean(draft.trim()) && (!working || draft.trimStart().startsWith('/'))}
        canStop={ready && !busy && Boolean(snapshot?.turnId)}
        attach={<ConversationAttachments sessionId={session.id} attachments={attachments} onChange={setAttachments} disabled={!ready || busy} />}
        settings={<ChatControls models={models} access={access} companies={companies} open={picker} disabled={busy}
          onOpen={menu => { if (menu && menu !== 'access' && (!models.models.length || models.error)) models.retry(); openMenu(menu); }}
          onSwitch={target => switchCompany(target, session.projectId, models.effort, handoffBrief(items, agent.name))} />}
        voice={voice.button} onMenuKey={menuKey}
        onChange={value => { edit(value); commands.setError(''); }} onSubmit={() => void submit()}
        onStop={() => void run(() => chatRequest('turn.interrupt', { sessionId: session.id, turnId: snapshot?.turnId }))}
        onCommands={() => { edit('/'); input.current?.focus(); }}
        onFocus={() => { useTerminalStore.setState({ focusedId: null }); useConversationTerminals.setState({ focused: session.id }); voice.focus(); }}
        onSelect={(start, end) => { memory.selection = { start, end }; }} />
    </footer></div>
    {inspector && <ConversationInspector key={`${session.id}:${inspector.mode}:${inspector.item?.id ?? ''}`} mode={inspector.mode} selected={inspector.item} session={session} snapshot={snapshot} items={items} run={run} onClose={() => setInspector(null)} onMode={(mode, item) => mode === 'model' || mode === 'effort' ? (setInspector(null), setPicker(mode)) : openInspector(mode, item)} />}
    </div>
  </section>;
}
