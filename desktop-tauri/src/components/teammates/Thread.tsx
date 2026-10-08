import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useVoiceStore } from '../../state/voiceStore';
import { avatarUrl, teammateApi, teammateApiDevice } from './api';
import { AccessHint } from './AccessHint';
import { RunnerNotice } from './RunnerNotice';
import { StageTwoOutputs } from './StageTwoOutputs';
import { ThreadComposer } from './ThreadComposer';
import { ThreadMessages } from './ThreadMessages';
import { useThread } from './useThread';
import { useRequestedRunScroll } from './useRequestedRunScroll';
import { useGrantedAccounts } from './useGrantedAccounts';
import { overviewClient } from './overviewClient';
import type { Teammate } from './types';
const overview = overviewClient(teammateApi, teammateApiDevice);
export function Thread({ agent, identity, active, enabled, v2 = false, header = true, onDetails, onBack, onRead, onAccess, onReload, preparedDraft }: { agent: Teammate; identity: string; active: boolean; enabled: boolean; v2?: boolean; header?: boolean; onDetails(tab?: 'Access'|'Work'): void; onBack(): void; onRead(cursor: string): void; onAccess(agent: Teammate): void; onReload(): void; preparedDraft?:{nonce:number;prompt:string} }) {
  const chat = useThread(agent, identity, active, enabled, v2), output = useRef<HTMLDivElement>(null), follow = useRef(true);
  const appliedDraft=useRef(0);
  useEffect(()=>{if(active&&chat.ready&&preparedDraft&&appliedDraft.current!==preparedDraft.nonce){appliedDraft.current=preparedDraft.nonce;chat.edit([chat.draft,preparedDraft.prompt].filter(Boolean).join('\n'));}},[active,chat.ready,preparedDraft]);
  const accounts = useGrantedAccounts(agent.id, agent.revision, v2);
  const anchor = useRef<{ height: number; top: number } | null>(null);
  const [newMessages, setNewMessages] = useState(false), [atBottom, setAtBottom] = useState(true);
  const lastRead = useRef(''), latestChat = useRef(chat); latestChat.current = chat;
  const tail = chat.turns.at(-1), running = tail && ['queued','running','waiting','reconciling'].includes(tail.status);
  useEffect(() => {
    if (!active || !chat.ready || chat.loadError || !atBottom || !agent.readCursor || lastRead.current === agent.readCursor || tail?.id !== agent.lastRunId) return;
    // v2: the per-device marker; a read of nothing new (already read here) is not sent.
    if (v2 && agent.unread === false) return;
    const cursor = agent.readCursor; lastRead.current = cursor;
    const undo = () => { if (lastRead.current === cursor) lastRead.current = ''; };
    if (v2) void overview.markRead(agent.id, cursor).then(result => { if (result === 'ok') onRead(cursor); else { undo(); onReload(); } }).catch(undo);
    else void teammateApi(`agents/v1/teammates/${agent.id}/read`, { cursor }).then(() => onRead(cursor)).catch(undo);
  }, [active, v2, chat.ready, chat.loadError, atBottom, agent.id, agent.readCursor, agent.unread, agent.lastRunId, tail]);
  useEffect(() => {
    if (!active || !enabled || chat.pending || agent.archived || chat.recoveryError) return;
    const target = { title: agent.name, append: (text: string) => { const c = latestChat.current; c.edit([c.draft, text].filter(Boolean).join(' ')); } };
    useVoiceStore.setState({ draftTarget: target });
    return () => { if (useVoiceStore.getState().draftTarget === target) { if (['starting','listening','transcribing'].includes(useVoiceStore.getState().phase)) useVoiceStore.getState().cancel(); useVoiceStore.setState({ draftTarget: null }); } };
  }, [active, enabled, Boolean(chat.pending), agent.id, agent.name, agent.archived, chat.recoveryError]);
  useLayoutEffect(() => {
    if (!active) return;
    if (anchor.current && output.current) { output.current.scrollTop = anchor.current.top + output.current.scrollHeight - anchor.current.height; anchor.current = null; return; }
    if (follow.current && output.current) { output.current.scrollTop = output.current.scrollHeight; setNewMessages(false); }
    else if (chat.turns.length) setNewMessages(true);
  }, [chat.turns, active]);
  useRequestedRunScroll(agent.id, active, chat.turns, output, follow);
  const model = tail?.model ?? agent.execution ?? agent.model ?? 'auto';
  const modelName = chat.models.find(m => m.id === model)?.name ?? (model === 'auto' ? 'Auto · matched to your task' : model.startsWith('provider:') ? `${model.slice(9).replace(/^./, c => c.toUpperCase())} · Auto` : model.split('/').at(-1));
  return <section className="teammate-thread" hidden={!active} aria-label={`Conversation with ${agent.name}`}>
    {header && <header className="teammate-thread-header"><button className="icon-btn teammate-back" aria-label="Back to teammates" onClick={onBack}>←</button><img src={avatarUrl(agent.avatar)} alt="" /><div><strong>{agent.name}</strong><small>{agent.archived ? 'Archived conversation' : modelName}</small></div><button className="icon-btn" title="Teammate details" aria-label="Teammate details" onClick={() => onDetails()}>···</button></header>}
    {v2&&<button type="button" onClick={()=>onDetails('Work')}>Work</button>}
    {v2 && active && <StageTwoOutputs key={`${identity}:${agent.id}`} agentId={agent.id} identity={identity} disabled={!enabled || agent.archived} />}
    <div className="teammate-messages" ref={output} onScroll={() => { if (!active || !output.current) return; const el = output.current; const near = el.scrollHeight - el.clientHeight - el.scrollTop < 80; follow.current = near; setAtBottom(near); if (near) setNewMessages(false); }}>
      <div className="teammate-transcript">{chat.hasMore && <button className="teammate-history-button" disabled={chat.loadingOlder} onClick={() => { if (output.current) anchor.current = { height: output.current.scrollHeight, top: output.current.scrollTop }; void chat.loadOlder().catch(() => { anchor.current = null; }); }}>{chat.loadingOlder ? 'Loading earlier messages…' : 'Load earlier messages'}</button>}{!chat.turns.length && !chat.loadError && <div className="teammate-empty"><img src={avatarUrl(agent.avatar)} alt="" /><h3>{chat.ready ? `Meet ${agent.name}` : 'Loading conversation…'}</h3>{chat.ready && <p>{agent.brief}</p>}</div>}
        <ThreadMessages agentId={agent.id} turns={chat.turns} enabled={enabled && active && !agent.archived} refresh={chat.refresh} accounts={accounts} />
      </div>
    </div>
    {newMessages && <button className="teammate-new-messages" onClick={() => { follow.current = true; setAtBottom(true); setNewMessages(false); if (output.current) output.current.scrollTop = output.current.scrollHeight; }}>Latest messages ↓</button>}
    <ThreadComposer chat={chat} agent={agent} enabled={enabled} running={running ? tail.id : undefined} onAccessTab={() => onDetails('Access')}
      access={enabled ? <>{v2 && active && <RunnerNotice />}<AccessHint agent={agent} draft={chat.draft} active={active} onSaved={onAccess} onReload={onReload} /></> : null} />
  </section>;
}
