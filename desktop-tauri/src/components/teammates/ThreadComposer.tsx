import { useLayoutEffect, useRef, useState } from 'react';
import { PlusIcon, SlidersIcon } from '../common/Icons';
import { useVoiceStore } from '../../state/voiceStore';
import type { Teammate } from './types';
import type { useThread } from './useThread';
export function ThreadComposer({ chat, agent, enabled, running }: { chat: ReturnType<typeof useThread>; agent: Teammate; enabled: boolean; running?: string }) {
  const [options, setOptions] = useState(false), input = useRef<HTMLTextAreaElement>(null);
  const voice = useVoiceStore(s => s.phase);
  const locked = chat.busy || Boolean(chat.pending) || Boolean(chat.recoveryError);
  const canSend = enabled && !agent.archived && chat.ready && !chat.loadError && chat.consented === true && !locked;
  useLayoutEffect(() => {
    const el = input.current; if (!el) return;
    const fit = () => { el.style.height = 'auto'; el.style.height = `${Math.min(150, Math.max(28, el.scrollHeight))}px`; };
    fit(); let width = el.clientWidth, frame = 0;
    const observer = new ResizeObserver(() => { if (width !== el.clientWidth) { width = el.clientWidth; cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); } });
    observer.observe(el); return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [chat.draft]);
  const efforts = chat.models.find(m => m.id === chat.model)?.reasoning?.efforts ?? [];
  return <div className="teammate-compose-area">
    {agent.archived && <p className="teammate-notice">This teammate is archived. Restore it in details to start a new task.</p>}
    {chat.error && <div className="teammate-notice error" role="alert"><span>{chat.error}</span>{(chat.loadError || chat.resourceError || chat.consented === null) && <button disabled={chat.busy} onClick={() => void chat.reload().catch(() => {})}>Retry conversation</button>}</div>}
    {chat.pending ? <div className="teammate-notice" role="status"><span>Checking a previous send keeps this message from being sent twice.</span><button disabled={chat.busy} onClick={() => void chat.reconcile()}>Check outcome</button><button disabled={chat.busy || !enabled || agent.archived} onClick={() => void chat.retry()}>Retry original send</button></div>
      : chat.consented === false && !agent.archived ? <div className="teammate-notice"><span>Messages and attachments are shared with AI providers. Tasks use your Vibyra allowance.</span><button disabled={chat.busy || !enabled} onClick={() => void chat.accept()}>Enable AI chat</button></div>
      : chat.quote && <div className="teammate-quote" role="status"><span>About <strong>{chat.quote.estimatedCredits} Vibes</strong><small>Up to {chat.quote.maxCredits} Vibes · unused allowance returns to you</small></span><button type="button" onClick={chat.dismissQuote} disabled={chat.busy}>Cancel</button><button className="primary" disabled={!canSend || Boolean(running)} onClick={() => void chat.send()}>Send message</button></div>}
    <form className="teammate-composer" onSubmit={e => { e.preventDefault(); if (canSend && !running) void chat.estimate(); }}>
      <div className="teammate-composer-attachments">{chat.attachments.map(file => <button type="button" disabled={locked} key={file.id} onClick={() => chat.removeAttachment(file.id)} aria-label={`Remove ${file.name}`}>{file.name}<span aria-hidden="true">×</span></button>)}</div>
      <div className="teammate-compose-line"><label className={`teammate-attach ${!canSend ? 'disabled' : ''}`} title="Attach a file"><PlusIcon size={18} /><input type="file" aria-label="Attach file" disabled={!canSend} onChange={e => { const file = e.target.files?.[0]; if (file) void chat.attach(file); e.target.value = ''; }} /></label>
        <textarea ref={input} rows={1} maxLength={4000} aria-label={`Message ${agent.name}`} placeholder={agent.archived ? 'This conversation is archived' : `Message ${agent.name}…`} value={chat.draft} onChange={e => chat.edit(e.target.value)} disabled={locked || agent.archived}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (canSend && !running && chat.draft.trim()) void chat.estimate(); } }} />
        <button type="button" className="icon-btn teammate-options-button" title="Model and thinking effort" aria-label="Message options" aria-expanded={options} onClick={() => setOptions(!options)}><SlidersIcon size={16} /></button>
        {running ? <button type="button" className="teammate-stop" aria-label="Stop task" disabled={chat.busy} onClick={() => void chat.stop(running)}><span aria-hidden="true">■</span> Stop</button>
          : chat.draft.trim() ? <button className="teammate-send" aria-label="Prepare message" title="Review message cost" disabled={!canSend}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" /></svg></button>
          : <button className="icon-btn teammate-mic" type="button" aria-label={voice === 'listening' ? 'Finish dictation' : 'Dictate message'} disabled={!canSend || ['starting','transcribing'].includes(voice)} onClick={() => useVoiceStore.getState().toggle()}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></svg></button>}
      </div>
      {options && <div className="teammate-composer-options"><label>Model<select aria-label="AI model" disabled={locked} value={chat.model} onChange={e => chat.setModel(e.target.value)}><option value="auto">Teammate default</option>{chat.models.filter(m => m.available && m.id !== 'auto').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        {efforts.length > 0 && <label>Thinking<select aria-label="Thinking effort" disabled={locked} value={chat.effort} onChange={e => chat.setEffort(e.target.value)}><option value="">Default effort</option>{efforts.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
        <span>{chat.draft.length}/4000</span></div>}
    </form>
    <p className="teammate-compose-hint">{chat.busy ? 'Please wait…' : 'Enter to review cost · Shift + Enter for a new line'}</p>
  </div>;
}
