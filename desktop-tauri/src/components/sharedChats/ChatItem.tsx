import { conversationViewMemory } from '../../../../mobile/src/conversation/viewMemory';
import { memo, useState } from 'react';
import { ConversationProse } from './ConversationProse';
import type { AgentItem } from '../../ipc/sharedChats';
import { answerRequest } from './delivery';
export const ChatItem = memo(function ChatItem({ item, sessionId, disabled, run, onInspect, summary }: {
  summary?: string;
  onInspect?: (item: AgentItem) => void;
  item: AgentItem; sessionId: string; disabled: boolean; run: (work: () => Promise<unknown>) => Promise<boolean>;
}) {
  const memory = conversationViewMemory(sessionId);
  const [answers, updateAnswers] = useState<Record<string, string>>(() => memory.answers[item.id] ?? {});
  const setAnswers = (update: (old: Record<string, string>) => Record<string, string>) => updateAnswers(old => {
    const next = update(old);
    memory.answers[item.id] = Object.fromEntries(Object.entries(next).filter(([id]) => !item.questions?.find(q => q.id === id)?.isSecret));
    return next;
  });
  if (item.kind === 'message') return <article className={`shared-message shared-message--${item.role}`}>
    {item.role === 'user' ? <div className="shared-prose">{item.text}</div> : <ConversationProse text={item.text ?? ''} />}{item.attachments?.map(a => <small className="conversation-attachment-receipt" key={a.id}>▧ {a.name} · Sent</small>)}{item.hasDetail && onInspect && <button className="conversation-text-button" onClick={() => onInspect(item)}>Read full message</button>}{item.truncated && <small>Message reached the retained size limit.</small>}
  </article>;
  if (item.kind === 'activity') return <details className="shared-activity"><summary>{item.title || 'Working'} <small>{item.status}</small></summary>
    <pre>{item.detail || 'No additional output.'}{item.truncated ? '\nOutput shortened by the computer.' : ''}</pre></details>;
  if (item.kind === 'result') return <p className="shared-result" role="status">{item.text || item.title || item.status}{summary ? ` · ${summary}` : ''}</p>;
  const pending = item.status === 'pending';
  return <article className="shared-request"><span className="shared-eyebrow">{pending ? 'Your response is needed' : item.status}</span>
    <h3>{item.title}</h3>{item.text && <p>{item.text}</p>}{item.detail && <pre>{item.detail}</pre>}
    {item.hasDetail && onInspect && <button className="conversation-text-button" onClick={() => onInspect(item)}>Review complete action</button>}
    {item.kind === 'permission' ? <><small>{item.decisionScope === 'acceptForSession' ? 'Allowed for this session' : item.decisionScope === 'acceptForProject' ? 'Saved project command rule' : item.allowLabel === 'Allow for this turn' ? 'This turn' : 'This action only'}{item.scope ? ` · ${item.scope}` : ''}</small>
      {pending && <div className="shared-actions"><button className="btn" disabled={disabled} onClick={() => void run(() => answerRequest(sessionId, item, { decision: 'decline' }))}>Decline</button>
        <button className="btn btn--primary" disabled={disabled} onClick={() => void run(() => answerRequest(sessionId, item, { decision: 'accept' }))}>{item.allowLabel ?? 'Allow once'}</button>
        {item.choices?.includes('acceptForSession') && <button className="btn" disabled={disabled} onClick={() => void run(() => answerRequest(sessionId, item, { decision: 'acceptForSession' }))}>Allow for this session</button>}</div>}
      {pending && item.persistentAvailable && <details className="conversation-trust"><summary>Always allow…</summary><p>This exact command in this project and working directory. Future matching requests will run without asking. Revoke from /permissions.</p><pre>{item.detail}</pre><button className="btn" disabled={disabled} onClick={() => void run(() => answerRequest(sessionId, item, { decision: 'acceptForProject' }))}>Save rule and allow</button></details>}</>
      : <form onSubmit={event => { event.preventDefault(); void run(() => answerRequest(sessionId, item, {
        answers: Object.fromEntries(Object.entries(answers).map(([id, answer]) => [id, { answers: [answer] }])),
      })); }}>
        {item.questions?.map(q => <fieldset key={q.id} disabled={disabled || !pending}><legend>{q.question}</legend>
          {q.options?.map(option => <label className="shared-option" key={option.label}><input type="radio" name={`${item.id}:${q.id}`} checked={answers[q.id] === option.label}
            onChange={() => setAnswers(old => ({ ...old, [q.id]: option.label }))} /> <span>{option.label}{option.description && <small>{option.description}</small>}</span></label>)}
          {(q.isOther || !q.options?.length) && <input aria-label={q.question} type={q.isSecret ? 'password' : 'text'} value={answers[q.id] ?? ''}
            placeholder="Your answer" onChange={event => setAnswers(old => ({ ...old, [q.id]: event.target.value }))} />}
        </fieldset>)}
        {pending && <button className="btn btn--primary" disabled={disabled || item.questions?.some(q => !answers[q.id]?.trim())}>Send answer</button>}
      </form>}
  </article>;
});
