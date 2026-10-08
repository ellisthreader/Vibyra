import { memo, useState } from 'react';
import type { AgentItem } from '../../ipc/sharedChats';
import { ConversationProse } from '../sharedChats/ConversationProse';
import { SpeakReply } from '../companion/ChatVoice';
import { ChatCopyIcon, ChatFileIcon } from './chatIcons';

/**
 * One message, laid out as on the phone: what you sent is a soft bubble on the
 * right; the agent writes straight onto the page. Copy and Read aloud wait
 * under a finished reply and only show on hover or keyboard focus.
 */
export const ChatMessage = memo(function ChatMessage({ item, live, active, onInspect }: {
  item: AgentItem; live: boolean; active: boolean; onInspect: (item: AgentItem) => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = item.text ?? '';
  if (item.role === 'user') return <div className="chat-user">
    <div className="chat-user__bubble">{text}</div>
    {item.attachments?.length ? <div className="chat-user__files">{item.attachments.map(file =>
      <span key={file.id} className="chat-file-chip"><ChatFileIcon size={12} />{file.name}</span>)}</div> : null}
    {item.status === 'sending' && <small className="chat-user__sending" role="status">Sending…</small>}
  </div>;
  const done = item.status === 'completed' && Boolean(text);
  const copy = () => void navigator.clipboard.writeText(text).then(() => {
    setCopied(true); setTimeout(() => setCopied(false), 1400);
  }).catch(() => setCopied(false));
  return <div className="chat-reply">
    <ConversationProse text={text} />
    {live && <span className="chat-pulse chat-pulse--inline" role="status" aria-label="Writing response" />}
    {item.hasDetail && <button type="button" className="chat-link-button" onClick={() => onInspect(item)}>Read full message</button>}
    {item.truncated && <small className="chat-note">Message reached the retained size limit.</small>}
    {done && <div className="chat-reply__actions">
      <button type="button" className="chat-voice-button" aria-label={copied ? 'Copied' : 'Copy reply'} title={copied ? 'Copied' : 'Copy reply'} onClick={copy}>
        {copied ? <span className="chat-copied">Copied</span> : <ChatCopyIcon size={14} />}
      </button>
      <SpeakReply text={text} active={active} />
    </div>}
  </div>;
});
