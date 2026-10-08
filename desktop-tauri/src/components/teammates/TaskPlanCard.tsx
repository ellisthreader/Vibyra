import { gapRows, droppedLine, planSummary, serviceRows, type FixStep } from '../../../../mobile/src/agents/v2/planModel.ts';
import { markId } from '../../../../mobile/src/agents/v2/providerLabels.ts';
import { HubMark } from '../settings/HubMark';
import type { PlanState } from './useTaskPlan';

/**
 * "What it will use": the services it can reach, which actions ask first, what was left out, and the one
 * step that fixes each gap. A preview only — Send is never disabled by it, and a failed check is one quiet line.
 */
export function TaskPlanCard({ state, busy, error, onFix, onCancel }: {
  state: PlanState | null; busy: string | null; error: string; onFix(step: FixStep): void; onCancel(): void;
}) {
  if (!state) return null;
  if (state.status === 'loading') return <p className="teammate-plan-quiet" role="status">Checking what it can use…</p>;
  if (state.status === 'error') return <p className="teammate-plan-quiet" role="status">Couldn’t check what it will use. You can still send.</p>;
  const { plan } = state, summary = planSummary(plan), dropped = droppedLine(plan), gaps = gapRows(plan), services = serviceRows(plan);
  return <section className="teammate-plan" aria-label="What it will use" aria-live="polite">
    <header><strong>What it will use</strong><span className="teammate-plan-summary" data-tone={summary.tone}>{summary.text}</span></header>
    {services.length > 0 && <ul className="teammate-plan-services" aria-label="Services and accounts">{services.map(s => <li key={s.key}>
      <HubMark id={markId(s.provider)} size={20} /><span><span className="teammate-plan-title"><strong>{s.name}</strong>{s.account ? ` · ${s.account}` : ''}</span><small>{s.line}</small></span></li>)}</ul>}
    {dropped && <p className="teammate-plan-note">{dropped}</p>}
    {gaps.length > 0 && <ul className="teammate-plan-gaps" aria-label="Needs attention">{gaps.map(g => <li key={g.key} data-blocking={g.blocking}>
      <span><strong>{g.title}</strong><small>{g.message}</small>{g.hint && <small>{g.hint}</small>}</span>
      {g.step.kind !== 'words' && (busy && busy.startsWith(`${g.step.kind}:`)
        ? <button type="button" onClick={onCancel}>Cancel sign-in</button>
        : <button type="button" disabled={Boolean(busy)} onClick={() => onFix(g.step)}>{g.step.kind === 'choose_ai_account' ? 'Open AI accounts' : g.step.label}</button>)}</li>)}</ul>}
    {error && <p role="alert" className="teammate-plan-note">{error}</p>}
  </section>;
}
