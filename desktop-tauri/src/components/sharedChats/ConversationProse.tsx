import { invoke } from '@tauri-apps/api/core';
import { safeConversationLink } from '../../../../mobile/src/conversation/safeLink';
import { Fragment, memo, useState } from 'react';
/** Text-only Markdown renderer: agent content never enters an HTML parser.
 * Memoised on its text: the split, inline pass and highlight rerun only for
 * the message that actually changed. */
export const ConversationProse = memo(function ConversationProse({ text }: { text: string }) {
  return <div className="conversation-prose">{text.split(/(```[\s\S]*?(?:```|$))/g).filter(Boolean).map((block, index) => {
    if (block.startsWith('```')) {
      const first = block.indexOf('\n');
      return <CodeBlock key={index} language={first < 0 ? '' : block.slice(3, first)} code={first < 0 ? '' : block.slice(first + 1).replace(/```$/, '')} />;
    }
    return <Fragment key={index}>{block.trim().split(/\n\n+/).map((paragraph, row) => {
      if (/^#{1,3} /.test(paragraph)) return <h3 key={row}>{inline(paragraph.replace(/^#{1,3} /, ''))}</h3>;
      if (/^(?:[-*] |\d+\. )/.test(paragraph)) return <ul key={row}>{paragraph.split('\n').map((line, i) => <li key={i}>{inline(line.replace(/^(?:[-*] |\d+\. )/, ''))}</li>)}</ul>;
      if (paragraph.startsWith('> ')) return <blockquote key={row}>{inline(paragraph.replace(/^> /gm, ''))}</blockquote>;
      return paragraph ? <p key={row}>{inline(paragraph)}</p> : null;
    })}</Fragment>;
  })}</div>;
});
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).map((part, i) => {
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) return <SafeLink key={i} label={link[1]} destination={link[2]} />;
    return part;
  });
}
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="conversation-code"><header><span>{language || 'Code'}</span>
    <button type="button" onClick={() => void navigator.clipboard.writeText(code).then(() => setCopied(true)).catch(() => setCopied(false))}>
      {copied ? 'Copied' : 'Copy'}</button></header><pre><code>{highlight(code)}</code></pre></div>;
}
function highlight(code: string) {
  return code.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/\/[^\n]*|\b(?:const|let|function|return|import|from|export|async|await|if|else|pub|fn|use|struct|def|class|true|false|null)\b|\b\d+\b)/g)
    .map((part, i) => <span key={i} className={/^["']/.test(part) ? 'syntax-string' : part.startsWith('//') ? 'syntax-comment'
      : /^(?:const|let|function|return|import|from|export|async|await|if|else|pub|fn|use|struct|def|class|true|false|null)$/.test(part) ? 'syntax-keyword' : /^\d+$/.test(part) ? 'syntax-number' : undefined}>{part}</span>);
}

function SafeLink({ label, destination }: { label: string; destination: string }) {
  const [error, setError] = useState('');
  const href = safeConversationLink(destination);
  if (!href) return <span title={destination}>{label} <small>({destination})</small></span>;
  return <><a className="conversation-link" href={href} title={href} target="_blank" rel="noopener noreferrer" onClick={event => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    event.preventDefault(); void invoke('shared_chat_open_link', { url: href }).catch(() => setError('Could not open link.'));
  }}>{label}</a>{error && <small role="alert"> {error}</small>}</>;
}
