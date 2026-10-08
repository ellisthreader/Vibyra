import '../../styles/agent-cloud-runtime.css';
import { useState } from 'react';
import { cloudMinutes, cloudRunProblem, cloudTokens } from '../../../../mobile/src/agents/v2/cloudRuntimeModel';
import type { CloudRuntimeStore, CloudAgentSnapshot, CloudAgentForm } from '../../../../mobile/src/agents/v2/cloudRuntimeStore';
export function AgentRuntime({ store, state, disabled, onSetup }: { store: CloudRuntimeStore; state: CloudAgentSnapshot; disabled: boolean; onSetup(): void }) {
  const [open, setOpen] = useState(false);
  const { page, form, review } = state, locked = disabled || state.busy || state.loading, policy = page?.policy;
  const account = page?.accounts.find(a => a.accountId === form.accountId);
  const field = (key: keyof CloudAgentForm, label: string) => <label>{label}<input aria-label={label} type="number" min="1" value={form[key]} disabled={locked || state.unknown} onChange={e => store.edit({ [key]: e.target.value })} /></label>;
  return <div className="teammate-cloud-runtime" style={{ padding: '8px 0', display: 'grid', gap: 8 }}>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="group" aria-label="Run tasks on">
      {(['local', 'cloud'] as const).map(target => <button type="button" key={target} aria-pressed={state.target === target} disabled={locked} onClick={() => void store.choose(target)}>{target === 'cloud' ? 'Cloud' : 'My computer'}</button>)}
      {state.target === 'cloud' && <button type="button" onClick={() => setOpen(!open)}>{open ? 'Hide allowance' : 'Account & allowance'}</button>}
    </div>
    {state.target === 'local' && state.error && <p role="alert">{state.error}</p>}
    {state.target === 'cloud' && <>
      <small>{policy?.enabled ? `Claude · ${policy.accountLabel || page?.accounts.find(a => a.accountId === policy.accountId)?.label || 'Selected Cloud account'} · ${policy.model} · ${policy.remainingStarts} starts left · ${cloudTokens(policy.remainingBudgetUnits)} tokens · ${cloudMinutes(policy.remainingSeconds)} min` : cloudRunProblem(page)}</small>
      <small>Computer: {page?.computer?.state ?? 'not set up'}. Cloud compute uses Vibyra tokens; the model uses your selected Claude account.</small>
      {(state.error || state.unknown) && <p role="alert">{state.error || 'Refresh to check the saved allowance.'}</p>}
      <div><button type="button" disabled={locked} onClick={() => void store.refresh()}>Refresh Cloud</button> <button type="button" onClick={onSetup}>Cloud setup & accounts</button></div>
      {open && <>
        <label>Cloud account<select aria-label="Cloud account" value={form.accountId} disabled={locked || state.unknown} onChange={e => store.edit({ accountId: e.target.value, model: '', effort: '' })}><option value="">Choose signed-in account</option>{page?.accounts.map(a => <option key={a.accountId} value={a.accountId} disabled={!a.authenticated || !a.online}>{a.label}{!a.authenticated || !a.online ? ' · sign-in needed' : ''}</option>)}</select></label>
        <label>Cloud model<select aria-label="Cloud model" value={form.model} disabled={locked || state.unknown} onChange={e => store.edit({ model: e.target.value })}><option value="">Choose model</option>{account?.models.map(m => <option key={m}>{m}</option>)}</select></label>
        {!!account?.efforts.length && <label>Thinking<select aria-label="Cloud thinking" value={form.effort} disabled={locked || state.unknown} onChange={e => store.edit({ effort: e.target.value })}><option value="">Default</option>{account.efforts.map(e => <option key={e}>{e}</option>)}</select></label>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{field('tokens', 'Tokens per start')}{field('minutes', 'Minutes per start')}{field('starts', 'Maximum starts')}{field('hours', 'Expires in hours')}</div>
        <button type="button" disabled={locked || state.unknown || !page?.enabled} onClick={() => void store.prepare()}>Review allowance</button>
        {review && <div role="region" aria-label="Review Cloud allowance"><p>{review.accountLabel} · Claude · {review.body.model}{review.body.effort ? ` · ${review.body.effort}` : ''}</p><p>Each start: up to {cloudTokens(review.quote.budgetUnits)} tokens and {cloudMinutes(review.quote.deadlineSeconds)} minutes. Rate: {cloudTokens(review.quote.unitsPerHour)} tokens/hour.</p><p>Approve {review.body.maxStarts} starts; total {cloudTokens(review.body.totalBudgetUnits)} tokens and {cloudMinutes(review.body.totalSeconds)} minutes. Expires {new Date(review.body.expiresAt).toLocaleString()}.</p><p>Each start uses one full allowance slot. Unused slot capacity is not restored. This may wake Cloud while your computer is off.</p><button type="button" disabled={locked || state.unknown} onClick={() => void store.approve()}>Approve Cloud allowance</button></div>}
        {policy?.enabled && <button type="button" disabled={locked || state.unknown} onClick={() => void store.revoke()}>Revoke Cloud allowance</button>}
      </>}
    </>}
  </div>;
}
