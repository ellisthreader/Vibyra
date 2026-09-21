import { useVoiceStore } from '../../state/voiceStore';
import { MemoryMarkdown } from '../companion/MemoryMarkdown';
import { parseMemoryDocument } from '../../lib/memoryDocument';
import { useEffect, useRef } from 'react';
import { avatarUrl, teammateApi } from './api';
import { Decision } from './Decision';
import { useThread } from './useThread';
import type { Teammate } from './types';
export function Thread({ agent, identity, active, enabled, onDetails }: { agent: Teammate; identity: string; active: boolean; enabled: boolean; onDetails(): void }) {
  const chat = useThread(agent, identity, active), output = useRef<HTMLDivElement>(null), follow = useRef(true);
  useEffect(() => { if (active && agent.readCursor) void teammateApi(`agents/v1/teammates/${agent.id}/read`, { cursor: agent.readCursor }).catch(() => {}); }, [active, agent.id, agent.readCursor]);
  const latestChat = useRef(chat); latestChat.current = chat;
  const voicePhase = useVoiceStore(s => s.phase);
  useEffect(() => {
    if (!active || !enabled || chat.pending || agent.archived) return;
    const target = {title:agent.name,append:(text:string)=>{const c=latestChat.current;c.edit([c.draft,text].filter(Boolean).join(' '));}};
    useVoiceStore.setState({draftTarget:target});
    return () => {if(useVoiceStore.getState().draftTarget===target){if(['starting','listening','transcribing'].includes(useVoiceStore.getState().phase))useVoiceStore.getState().cancel();useVoiceStore.setState({draftTarget:null});}};
  },[active,enabled,Boolean(chat.pending),agent.id,agent.archived]);
  const tail = chat.turns.at(-1), running = tail && ['queued','running','waiting','reconciling'].includes(tail.status);
  useEffect(() => { if (follow.current && output.current) output.current.scrollTop = output.current.scrollHeight; }, [chat.turns]);
  return <section className="teammate-thread" hidden={!active} aria-label={`Conversation with ${agent.name}`}>
    <header className="teammate-thread-header"><img src={avatarUrl(agent.avatar)} alt="" /><strong>{agent.name}</strong><small>{tail?.model ?? 'Auto'}</small><button className="icon-btn" aria-label="Teammate details" onClick={onDetails}>···</button></header>
    <div className="teammate-messages" ref={output} onScroll={() => { const el = output.current!; follow.current = el.scrollHeight - el.clientHeight - el.scrollTop < 80; }}>
      {!chat.turns.length && <p className="teammate-empty">{chat.ready ? 'What would you like to work on?' : 'Loading conversation…'}</p>}
      {chat.turns.map(turn => <div className="teammate-turn" key={turn.id}>
        <div className="teammate-bubble you">{turn.prompt}</div>
        {turn.attachments?.map(file => <div className="teammate-file" key={file.id}>{file.name} · {file.bytes} bytes</div>)}
        {turn.response && <div className="teammate-bubble them"><MemoryMarkdown model={parseMemoryDocument(turn.response)} emptyCopy="" /></div>}
        {turn.tools?.map(tool => tool.approval ? <Decision key={tool.id} tool={tool} turn={turn} enabled={enabled && active && !agent.archived} refresh={chat.refresh} /> : <small key={tool.id}>{tool.summary ?? tool.operation}</small>)}
        {['queued','running','waiting','reconciling'].includes(turn.status) && <small role="status">{turn.status === 'waiting' ? 'Waiting for a tool or your decision…' : turn.status === 'reconciling' ? 'Checking outcome…' : 'Working…'}</small>}
        {turn.error && <p role="alert">{turn.error}</p>}
      </div>)}
    </div>
    {chat.error && <p className="teammate-notice" role="alert">{chat.error}</p>}
    {chat.pending ? <div className="teammate-notice">A send needs confirmation.<button disabled={chat.busy} onClick={() => void chat.reconcile()}>Check outcome</button><button disabled={chat.busy || !enabled} onClick={() => void chat.retry()}>Retry original send</button></div>
      : !chat.consented ? <div className="teammate-notice">Messages are processed by AI providers and use your Vibyra allowance.<button disabled={chat.busy} onClick={() => void chat.accept()}>Enable AI chat</button></div>
      : chat.quote && <div className="teammate-notice">Estimated {chat.quote.estimatedCredits} credits · maximum {chat.quote.maxCredits}<button disabled={chat.busy || !enabled || agent.archived} onClick={() => void chat.send()}>Send message</button></div>}
    <form className="teammate-composer" onSubmit={e => { e.preventDefault(); void chat.estimate(); }}>
      <div>{chat.attachments.map(file => <button type="button" disabled={Boolean(chat.pending) || chat.busy} key={file.id} onClick={() => chat.removeAttachment(file.id)} aria-label={`Remove ${file.name}`}>{file.name} ×</button>)}</div>
      <textarea aria-label={`Message ${agent.name}`} placeholder={`Message ${agent.name}`} value={chat.draft} onChange={e => chat.edit(e.target.value)} disabled={Boolean(chat.pending) || chat.busy} />
      <div><label className="teammate-attach">＋<input type="file" aria-label="Attach file" disabled={chat.busy || !chat.consented || Boolean(chat.pending) || !enabled} onChange={e => { const file = e.target.files?.[0]; if (file) void chat.attach(file); e.target.value = ''; }} /></label><select aria-label="AI model" value={chat.model} onChange={e => chat.setModel(e.target.value)}><option value="auto">Auto</option>{chat.models.filter(m => m.available && m.id !== 'auto').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        {Boolean(chat.models.find(m=>m.id===chat.model)?.reasoning?.efforts.length) && <select aria-label="Thinking effort" value={chat.effort} onChange={e=>chat.setEffort(e.target.value)}><option value="">Default effort</option>{chat.models.find(m=>m.id===chat.model)?.reasoning?.efforts.map(value=><option key={value} value={value}>{value}</option>)}</select>}
        <button type="button" aria-label={voicePhase === 'listening' ? 'Finish dictation' : 'Dictate message'} disabled={chat.busy || Boolean(chat.pending) || !enabled} onClick={() => useVoiceStore.getState().toggle()}>{voicePhase === 'listening' ? 'Finish' : 'Mic'}</button>
        {running ? <button type="button" disabled={chat.busy || !enabled} onClick={() => void chat.stop(tail.id)}>Stop</button> : <button aria-label="Prepare message" disabled={!chat.draft.trim() || !chat.ready || chat.busy || !chat.consented || Boolean(chat.pending) || !enabled || agent.archived}>↑</button>}
      </div>
    </form>
  </section>;
}
