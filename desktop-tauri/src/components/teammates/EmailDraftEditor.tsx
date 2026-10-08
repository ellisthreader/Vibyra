import { useEffect, useRef, useState } from 'react';
import { teammateApi, message } from './api';
import { stageTwoClient } from '../../../../mobile/src/agents/v2/stageTwoModel.ts';
import { uploadDraftFile } from './emailDraftUpload';
import type { AgentDraft, DraftAttachment } from '../../../../mobile/src/agents/v2/outputModel.ts';
import '../../styles/teammate-memory.css';
const api = stageTwoClient(teammateApi);
/** Editing never sends email. Uncertain saves require a read before another mutation. */
export function EmailDraftEditor({ id, runId, disabled, refresh, onEditing }: {
  id: string; runId: string; disabled: boolean; refresh(): Promise<void>; onEditing(value: boolean): void;
}) {
  const [draft, setDraft] = useState<AgentDraft | null>(null), [args, setArgs] = useState({ to: '', subject: '', body: '' });
  const [sender, setSender] = useState(''), [files, setFiles] = useState<DraftAttachment[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [unknown, setUnknown] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), generation = useRef(0);
  useEffect(() => () => { generation.current++; }, [id, runId]);
  const close = () => { setOpen(false); setDraft(null); setUnknown(false); setFiles([]); setSender(''); onEditing(false); };
  const load = async () => {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(true); setError(''); onEditing(true); setOpen(true); const version = generation.current;
    try {
      const next = await api.draft(id);
      if (next.id !== id || next.runId !== runId) throw new Error('This draft belongs to a different task.');
      await refresh();
      if (version === generation.current) { setDraft(next); setArgs(next.arguments); setSender(next.connectionId ?? ''); setFiles(next.attachments ?? []); setUnknown(false); }
    } catch (e) { if (version === generation.current) { setError(message(e)); setDraft(null); setUnknown(true); } }
    finally { if (version === generation.current) { lock.current = false; setBusy(false); } }
  };
  const save = async () => {
    if (lock.current || disabled || unknown || !draft) return;
    lock.current = true; setBusy(true); setError(''); const version = generation.current;
    try { await api.editDraft(draft, args, { ...(sender ? { connectionId: sender } : {}), ...(draft.editableFields.includes('attachments') ? { attachmentIds: files.map(file => file.id) } : {}) }); await refresh(); if (version === generation.current) close(); }
    catch (e) { if (version === generation.current) { setError(`${message(e)} Reload draft to check the saved version.`); setUnknown(true); } }
    finally { if (version === generation.current) { lock.current = false; setBusy(false); } }
  };
  const attach = async (file: File) => {
    if (lock.current || disabled || unknown || !draft || files.length >= 4) return;
    lock.current = true; setBusy(true); setError(''); const version = generation.current;
    try {
      const uploaded = await uploadDraftFile(file, () => version === generation.current);
      if (version === generation.current) setFiles(old => [...old, uploaded]);
    } catch (e) { if (version === generation.current) setError(message(e)); }
    finally { if (version === generation.current) { lock.current = false; setBusy(false); } }
  };
  const cancel = async () => {
    if (lock.current) return; lock.current = true; setBusy(true); const version = generation.current;
    try { await refresh(); if (version === generation.current) close(); } catch (e) { if (version === generation.current) { setError(message(e)); setUnknown(true); } }
    finally { if (version === generation.current) { lock.current = false; setBusy(false); } }
  };
  if (!open) return <button type="button" disabled={disabled || busy} onClick={() => void load()}>Edit email draft</button>;
  return <section className="teammate-email-draft" aria-label="Edit email draft" aria-busy={busy}>
    <label>From{draft?.senders?.length ? <select aria-label="Email from" value={sender} disabled={disabled || busy || unknown} onChange={e => setSender(e.target.value)}>
      {draft.senders.map(item => <option key={item.connectionId} value={item.connectionId}>{item.account}</option>)}
    </select> : <p>{draft?.account ?? 'the connected account'}</p>}</label>
    {(['to', 'subject', 'body'] as const).map(key => <label key={key}>{key === 'to' ? 'To' : key === 'subject' ? 'Subject' : 'Body'}
      {key === 'body' ? <textarea aria-label="Email body" value={args.body} maxLength={10000} disabled={disabled || busy || !draft || unknown} onChange={e => setArgs(old => ({ ...old, body: e.target.value }))} />
        : <input aria-label={`Email ${key}`} value={args[key]} maxLength={key === 'subject' ? 200 : 320} disabled={disabled || busy || !draft || unknown} onChange={e => setArgs(old => ({ ...old, [key]: e.target.value }))} />}
    </label>)}
    {draft?.editableFields.includes('attachments') && <div aria-label="Email attachments">
      <p>Attachments · up to four files, 2 MB each</p>
      {files.map(file => <div key={file.id}><span>{file.name} · {file.mimeType || 'Uploaded file'} · {file.size.toLocaleString()} bytes</span>
        <button type="button" disabled={disabled || busy || unknown} aria-label={`Remove ${file.name}`} onClick={() => setFiles(old => old.filter(item => item.id !== file.id))}>Remove</button></div>)}
      <input ref={input} type="file" hidden accept="image/*,application/pdf,text/*,.md,.csv,.json" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void attach(file); }} />
      <button type="button" disabled={disabled || busy || unknown || files.length >= 4} onClick={() => input.current?.click()}>Add attachment</button>
    </div>}
    <div className="teammate-decision-actions"><button type="button" disabled={busy} onClick={() => void cancel()}>Cancel edit</button>
      <button type="button" className="primary" disabled={disabled || busy || unknown || !draft || !args.to.trim() || !args.subject.trim() || !args.body.trim()} onClick={() => void save()}>Save and review</button></div>
    {error && <p role="alert">{error}</p>}{unknown && <button type="button" disabled={busy} onClick={() => void load()}>Reload draft</button>}
  </section>;
}
