import { Proposals } from './work/Proposals';
import { stageFourClient } from '../../../../mobile/src/agents/v2/stageFourClient';
import { teammateApi } from './api';
const workApi=stageFourClient(teammateApi);
import { MemoryMarkdown } from '../companion/MemoryMarkdown';
import { parseMemoryDocument } from '../../lib/memoryDocument';
import { StageTwoOutput } from './StageTwoOutput';
import { StageTwoSteering } from './StageTwoSteering';
import { Decision } from './Decision';
import { providerName, toolWords } from '../../../../mobile/src/agents/v2/providerLabels.ts';
import type { Turn } from './types';
import type { AccountCounts } from './useGrantedAccounts';
const states: Record<string, string> = { queued: 'Getting started…', running: 'Working…', waiting: 'Waiting for a tool or your decision…', reconciling: 'Checking the outcome…', cancelled: 'Task stopped' };
export function ThreadMessages({ turns, enabled, refresh, accounts, agentId }: { turns: Turn[]; enabled: boolean; refresh(): Promise<void>; accounts?: AccountCounts;agentId?:string }) {
  return <>{turns.map(turn => <article className="teammate-turn" key={turn.id} data-run-id={turn.id} aria-label="Task and reply">
    <div className="teammate-bubble you">{turn.prompt}</div>
    {turn.attachments?.map(file => <div className="teammate-file" key={file.id}><span aria-hidden="true">↗</span><span>{file.name}<small>{Math.max(1, Math.round(file.bytes / 1024))} KB · attached file</small></span></div>)}
    {turn.response && <div className="teammate-bubble them"><MemoryMarkdown model={parseMemoryDocument(turn.response)} emptyCopy="" /></div>}
    {turn.tools?.map(tool => tool.approval ? <Decision key={tool.id} tool={tool} turn={turn} enabled={enabled} refresh={refresh} accounts={accounts} /> : <p className="teammate-task-status" key={tool.id}>{tool.v2 ? `${providerName(tool.integration || null)} · ${tool.summary ?? toolWords(tool.operation, tool.integration)}` : tool.summary ?? tool.operation.replaceAll('_', ' ')}</p>)}
    {(turn.notice ?? states[turn.status]) && <p className="teammate-task-status" role="status"><span className={`teammate-status-dot ${['cancelled', 'failed'].includes(turn.status) ? 'stopped' : ''}`} />{turn.notice ?? states[turn.status]}</p>}
    {turn.outputs?.map(item => <StageTwoOutput key={`${item.id}:${item.revision}`} output={item} disabled={!enabled} />)}
    {turn.v2 && <StageTwoSteering key={turn.id} runId={turn.id} active={enabled && ['queued', 'running', 'waiting'].includes(turn.status)} refresh={refresh} />}
    {turn.v2&&agentId&&<Proposals api={workApi} agentId={agentId} runId={turn.id} active={enabled&&['queued','running','waiting'].includes(turn.status)} disabled={!enabled}/>}
    {turn.error && <p className="teammate-task-error" role="alert">{turn.error}</p>}
  </article>)}</>;
}
