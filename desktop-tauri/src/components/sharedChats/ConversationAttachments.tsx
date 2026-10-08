import { useRef, useState } from 'react';
import { chatRequest } from '../../ipc/sharedChats';
import { uploadAttachment, type ConversationAttachment } from '../../../../mobile/src/conversation/attachmentUpload';
export function ConversationAttachments({ sessionId, attachments, onChange, disabled }: { sessionId: string;
  attachments: ConversationAttachment[]; onChange: (items: ConversationAttachment[]) => void; disabled: boolean }) {
  const file = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <><input ref={file} type="file" hidden accept="image/png,image/jpeg,image/webp,text/plain,.md,.ts,.tsx,.js,.json,.py,.rs" onChange={event => {
    const source = event.target.files?.[0]; if (!source) return;
    setBusy(true); setError('');
    void (async () => {
      if (source.size > 2 * 1024 * 1024) throw new Error('Use an attachment under 2 MB.');
      const content = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(source); });
      const next = await uploadAttachment(p => chatRequest<ConversationAttachment>('conversation.attachment', { sessionId, ...p }), crypto.randomUUID(), source.name, source.type.startsWith('image/') ? source.type : 'text/plain', content);
      onChange([...attachments, next]);
    })().catch(e => setError(String(e))).finally(() => { setBusy(false); if (file.current) file.current.value = ''; });
  }} /><button type="button" className="conversation-tool" aria-label="Attach image or text file" disabled={disabled || busy || attachments.length >= 4} onClick={() => file.current?.click()}>{busy ? '…' : '+'}</button>
    {attachments.map(item => <button type="button" key={item.id} className="conversation-model" aria-label={`Remove ${item.name}`} title="Prepared on your computer; sent with your next message" onClick={() => onChange(attachments.filter(a => a.id !== item.id))}>{item.name} ×</button>)}
    {error && <span role="alert" className="shared-error">{error}</span>}</>;
}
