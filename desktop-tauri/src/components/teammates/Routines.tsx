import { withAgentRuntime } from '../../../../mobile/src/agents/v2/cloudRuntimeModel';
import { useAgentRuntime } from './useAgentRuntime';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { ScheduleEditor } from './ScheduleEditor';
import { ScheduleItem } from './ScheduleItem';
import { TriggerEditor } from './TriggerEditor';
import { TriggerItem } from './TriggerItem';
import { WebhookCard } from './WebhookCard';
import { useCapabilities, useRoutines } from './useRoutines';
import type { ScheduleDraft } from '../../../../mobile/src/agents/v2/routinesModel.ts';
import type { Trigger, TriggerDraft, Webhook } from '../../../../mobile/src/agents/v2/triggersModel.ts';

/** A starter's suggestion, opened in the real editor by the person; each click is a new object so it re-opens. */
export interface RoutineSeed { schedule?: Partial<ScheduleDraft>; trigger?: Partial<TriggerDraft> }

/** Enter in these fields must not submit the teammate profile form around them. */
const keepEnter = (event: KeyboardEvent) => { if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') event.preventDefault(); };

/**
 * Agent V2 routines and triggers for one saved teammate (Access tab). Renders nothing unless the
 * account's capabilities say they exist. Every run they start is an ordinary run in the thread.
 */
export function Routines({ agentId, identity, disabled, onOpenChat, seed, onSeedUsed }: { agentId?: string; identity: string; disabled: boolean; onOpenChat(): void; seed?: RoutineSeed | null; onSeedUsed?(): void }) {
  const caps = useCapabilities(identity);
  if (!caps.routines && !caps.triggers) return null;
  if (!agentId) return <p className="profile-help routines-note">Save the teammate to schedule routines and triggers.</p>;
  return <RoutineSections identity={identity} agentId={agentId} caps={caps} disabled={disabled} onOpenChat={onOpenChat} seed={seed} onSeedUsed={onSeedUsed} />;
}

function RoutineSections({ identity, agentId, caps, disabled, onOpenChat, seed, onSeedUsed }: { identity: string; agentId: string; caps: ReturnType<typeof useCapabilities>; disabled: boolean; onOpenChat(): void; seed?: RoutineSeed | null; onSeedUsed?(): void }) {
  const r = useRoutines(agentId, caps);
  const runtime = useAgentRuntime(identity, agentId, true);
  const runtimeClient = { ...r.client, createSchedule: (body: Parameters<typeof r.client.createSchedule>[0]) => r.client.createSchedule(withAgentRuntime(body,runtime.store.runtimeId)) };
  const [newRoutine, setNewRoutine] = useState(false), [newTrigger, setNewTrigger] = useState(false);
  const [created, setCreated] = useState<{ trigger: Trigger; webhook: Webhook } | null>(null);
  const [initial, setInitial] = useState<RoutineSeed & { n: number }>({ n: 0 });
  useEffect(() => {
    if (!seed) return;
    if (seed.schedule) { setNewRoutine(true); setInitial(i => ({ ...i, schedule: seed.schedule, n: i.n + 1 })); }
    if (seed.trigger) { setNewTrigger(true); setCreated(null); setInitial(i => ({ ...i, trigger: seed.trigger, n: i.n + 1 })); }
    onSeedUsed?.();
    requestAnimationFrame(() => document.querySelector('.routines')?.scrollIntoView({ block: 'nearest' }));
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const off = disabled || !r.loaded || Boolean(runtime.problem);
  return <div className="routines" onKeyDown={keepEnter}>
    <p className="profile-help">New routines use {runtime.state.target === 'cloud' ? 'Cloud and its approved account allowance' : 'My computer'}. Change this choice in the conversation before scheduling.</p>
    {runtime.problem && <p>{runtime.problem} <button onClick={() => void runtime.store.refresh()}>Refresh routine runtime</button></p>}
    {r.error && <p role="alert" className="routines-error">{r.error} <button type="button" onClick={() => void r.refresh()}>Retry</button></p>}
    {caps.routines && <section className="routines-section" aria-label="Routines">
      <div className="routines-head"><div><h3>Routines</h3><p className="profile-help">Runs this teammate on a schedule. Each run appears in its conversation.</p></div>
        {!newRoutine && <button type="button" className="routines-add" disabled={off} onClick={() => setNewRoutine(true)}>New routine</button>}</div>
      {newRoutine && <ScheduleEditor key={`s${initial.n}`} initial={initial.schedule} agentId={agentId} client={runtimeClient} disabled={off}
        onCancel={() => setNewRoutine(false)} onSaved={s => { r.putSchedule(s, s.id); setNewRoutine(false); }} />}
      {r.loaded && !r.schedules.length && !newRoutine && <p className="profile-help routines-empty">No routines yet.</p>}
      {r.schedules.map(s => <ScheduleItem key={s.id} schedule={s} client={r.client} disabled={disabled} onChanged={next => r.putSchedule(next, s.id)} onOpenChat={onOpenChat} />)}
    </section>}
    {caps.triggers && <section className="routines-section" aria-label="When something happens">
      <div className="routines-head"><div><h3>When something happens</h3><p className="profile-help">Starts a run when a saved event arrives, up to an hourly cap.</p></div>
        {!newTrigger && <button type="button" className="routines-add" disabled={off} onClick={() => { setNewTrigger(true); setCreated(null); }}>New trigger</button>}</div>
      {newTrigger && <TriggerEditor key={`t${initial.n}`} initial={initial.trigger} agentId={agentId} client={r.client} kinds={caps.triggerKinds} disabled={disabled}
        onCancel={() => setNewTrigger(false)} onCreated={(trigger, webhook) => { r.putTrigger(trigger, trigger.id); setNewTrigger(false); if (webhook) setCreated({ trigger, webhook }); }} />}
      {created && <WebhookCard trigger={created.trigger} webhook={created.webhook} onDone={() => setCreated(null)} />}
      {r.loaded && !r.triggers.length && !newTrigger && <p className="profile-help routines-empty">No triggers yet.</p>}
      {r.triggers.map(t => <TriggerItem key={t.id} trigger={t} client={r.client} disabled={disabled} onChanged={next => r.putTrigger(next, t.id)} onOpenChat={onOpenChat} />)}
    </section>}
  </div>;
}
