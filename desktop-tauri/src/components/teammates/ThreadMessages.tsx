import { MemoryMarkdown } from '../companion/MemoryMarkdown';
import { parseMemoryDocument } from '../../lib/memoryDocument';
import { Decision } from './Decision';
import type { Turn } from './types';
const states: Record<string, string> = { queued: 'Getting started…', running: 'Working…', waiting: 'Waiting for a tool or your decision…', reconciling: 'Checking the outcome…', cancelled: 'Task stopped' };
export function ThreadMessages({ turns, enabled, refresh }: { turns: Turn[]; enabled: boolean; refresh(): Promise<void> }) {
  return <>{turns.map(turn => <article className="teammate-turn" key={turn.id} aria-label="Task and reply">
    <div className="teammate-bubble you">{turn.prompt}</div>
    {turn.attachments?.map(file => <div className="teammate-file" key={file.id}><span aria-hidden="true">↗</span><span>{file.name}<small>{Math.max(1, Math.round(file.bytes / 1024))} KB · attached file</small></span></div>)}
    {turn.response && <div className="teammate-bubble them"><MemoryMarkdown model={parseMemoryDocument(turn.response)} emptyCopy="" /></div>}
    {turn.tools?.map(tool => tool.approval ? <Decision key={tool.id} tool={tool} turn={turn} enabled={enabled} refresh={refresh} /> : <p className="teammate-task-status" key={tool.id}>{tool.summary ?? tool.operation.replaceAll('_', ' ')}</p>)}
    {states[turn.status] && <p className="teammate-task-status" role="status"><span className={`teammate-status-dot ${turn.status === 'cancelled' ? 'stopped' : ''}`} />{states[turn.status]}</p>}
    {turn.error && <p className="teammate-task-error" role="alert">{turn.error}</p>}
  </article>)}</>;
}
