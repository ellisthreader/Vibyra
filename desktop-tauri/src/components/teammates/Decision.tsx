import { approvalFields, attachmentReview } from '../../../../mobile/src/agents/chatPresentation';
import { EmailDraftEditor } from './EmailDraftEditor';
import { useEffect, useRef, useState } from 'react';
import { approvalExpiry, decisionAvailable, reviewedApproval } from '../../../../mobile/src/agents/approvalReview';
import { teammateApi, message } from './api';
import { computerName } from '../../lib/platform';
import { decideRun } from './runsV2';
import { providerName, toolWords } from '../../../../mobile/src/agents/v2/providerLabels.ts';
import { approvalAccount } from '../../../../mobile/src/agents/v2/approvalAccount.ts';
import type { AccountCounts } from './useGrantedAccounts';
import type { Tool, Turn } from './types';
export function Decision({ tool, turn, enabled, refresh, accounts }: { tool: Tool; turn: Turn; enabled: boolean; refresh(): Promise<void>; /** v2: how many accounts of this provider the teammate may use, so two accounts never look alike. */ accounts?: AccountCounts }) {
  const lock = useRef(false); const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [unknown, setUnknown] = useState(false), [, tick] = useState(0);
  useEffect(() => { if (tool.v2 && tool.approval?.state === 'pending') accounts?.refresh(); }, [accounts, tool.v2, tool.approval?.state]);
  useEffect(() => { if (tool.approval?.state !== 'pending') return; const timer = setTimeout(() => tick(n => n + 1), Math.max(0, Math.min(2147483647, tool.expiresAt * 1000 - Date.now() + 20))); return () => clearTimeout(timer); }, [tool.expiresAt, tool.approval?.state]);
  const available = decisionAvailable;
  const decide = async (decision: 'allow' | 'decline') => {
    if (lock.current || !enabled || editing || unknown) return; lock.current = true; setBusy(true); setError('');
    try {
      if (tool.v2) {
        // A stale or expired action is refused before the POST; only an unanswered POST stays unconfirmed.
        await decideRun(teammateApi, turn, tool, decision, () => setUnknown(true)).catch(async e => { if (/^This action changed/.test(message(e))) await refresh(); throw e; });
        await refresh(); setUnknown(false); return;
      }
      const latest = (await teammateApi<{ turn: Turn }>(`vibes/turns/${turn.id}`)).turn;
      let current: Tool;
      try { current = reviewedApproval(turn, tool, latest) as Tool; }
      catch (e) { await refresh(); throw e; }
      setUnknown(true);
      await teammateApi(`agents/v1/decisions/${tool.id}`, { fingerprint: current.approval!.fingerprint, decision });
      await refresh(); setUnknown(false);
    } catch (e) { setError(message(e)); } finally { lock.current = false; setBusy(false); }
  };
  // A v2 action names its own provider and account (contract §6d), plus a short connection id when several accounts are granted (F-07); a v1 one keeps its connector id.
  const account = tool.v2 ? approvalAccount(tool.account, tool.connectionId, accounts?.count(tool.integration ?? '') ?? 1) : null;
  const emailFiles = tool.operation === 'gmail_send' ? attachmentReview(tool.approval?.arguments.attachments) : null;
  const source = tool.v2 ? `${[providerName(tool.integration || null), account].filter(Boolean).join(' · ')} · ${toolWords(tool.operation, tool.integration)}` : `${tool.integration ?? 'Agent Computer'} · ${tool.operation.replaceAll('_', ' ')}`;
  return <article className="teammate-decision"><small>{source}</small>{tool.approval?.state === 'pending' && <><dl className="teammate-approval-fields" style={{ margin: 0, maxHeight: 220, overflow: 'auto' }}>{approvalFields(tool.approval.arguments).filter(field => field.key !== 'attachments' || emailFiles === null).map(({key, label, value}) => <div key={key} style={{ marginTop: 8 }}><dt style={{ fontSize: 12, opacity: .7 }}>{label}</dt><dd style={{ margin: '3px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value}</dd></div>)}</dl><small>{approvalExpiry(tool.expiresAt)}</small></>}
    {tool.approval?.state === 'pending' && emailFiles !== null && <section aria-label="Email attachment review"><small>Attachments</small><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '4px 0' }}>{emailFiles}</p></section>}
    <details><summary>Details</summary><pre>{JSON.stringify(tool.approval?.arguments, null, 2)}</pre></details>
    {tool.operation === 'run_test' && <p>The selected file bytes run in a disconnected Linux VM. The teammate receives the test output.</p>}
    {tool.operation === 'publish_branch' && <p>Review the repository, base commit, branch, message and every changed file. Approval publishes this exact snapshot to GitHub once.</p>}
    {tool.v2 && tool.operation === 'gmail_send' && available(tool, turn) && <EmailDraftEditor key={tool.id} id={tool.id} runId={turn.id} disabled={!enabled || busy || unknown} refresh={refresh} onEditing={setEditing} />}
    {available(tool, turn) ? <div className="teammate-decision-actions"><button disabled={!enabled || editing || busy || unknown} onClick={() => void decide('decline')}>{tool.operation === 'gmail_send' ? 'Discard' : 'Deny'}</button><button className="primary" disabled={!enabled || editing || busy || unknown} onClick={() => void decide('allow')}>{tool.operation === 'gmail_send' ? 'Send once' : 'Approve once'}</button></div> : <p>{({ queued: 'Approved · waiting to run', dispatching: 'Running action', publishing: 'Publishing GitHub branch', completed: 'Action completed', declined: 'Declined', expired: 'Expired', refused: 'Not run · access or connection changed', failed: 'Action failed', cancelled: 'Cancelled with the task', unknown: tool.operation === 'publish_branch' ? 'GitHub branch outcome unconfirmed · inspect the repository before retrying' : tool.integration ? 'Outcome unconfirmed' : tool.operation === 'run_test' ? 'Test result unconfirmed · check this task before retrying' : `Outcome unconfirmed · check the file on your ${computerName}` } as Record<string,string>)[tool.approval?.state ?? ''] ?? (tool.expiresAt * 1000 <= Date.now() ? 'Expired' : 'Checking action status')}</p>}
    {error && <p role="alert">{error}</p>}{unknown && <button disabled={busy} onClick={() => void refresh().then(() => { setUnknown(false); setError(''); }).catch(e => setError(message(e)))}>Refresh decision</button>}
  </article>;
}
