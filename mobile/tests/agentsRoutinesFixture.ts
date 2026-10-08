import { RunError } from '../src/agents/v2/runsApi';
import type { RoutinesApi } from '../src/agents/v2/routinesApi';
import type { Schedule } from '../src/agents/v2/routinesModel';
import type { Trigger } from '../src/agents/v2/triggersModel';

/** Simulated Agent v2 routines/triggers for `?v2` fixtures. No live scheduler, webhook or account. */
export function fixtureRoutines(calls: unknown[]): RoutinesApi {
  const clone = <T,>(value: T): T => structuredClone(value);
  let schedules: Schedule[] = [];
  let triggers: Trigger[] = [];
  const next = (time: string) => [`2026-10-01T${time}:00+01:00`, `2026-10-02T${time}:00+01:00`, `2026-10-03T${time}:00+01:00`];
  const find = <T extends { id: string }>(list: T[], id: string) => {
    const item = list.find(x => x.id === id);
    if (!item) throw new RunError('Not found', 404, 'schedule_not_found');
    return item;
  };
  return {
    capabilities: async () => ({ enabled: true, routines: true, triggers: true,
      triggerKinds: ['github.issue', 'github.pull_request', 'stripe.event', 'gmail.message', 'calendar.event_soon'] }),
    preview: async (timezone, recurrence) => {
      calls.push({ action: 'v2-schedule-preview', timezone, recurrence: clone(recurrence) });
      return { description: recurrence.type === 'daily' ? `Every day at ${recurrence.time}` : `Custom at ${recurrence.time}`,
        next: next(recurrence.time).map(local => ({ at: local, local })) };
    },
    list: async agentId => clone(schedules.filter(s => s.agentId === agentId)),
    create: async body => {
      calls.push({ action: 'v2-schedule-create', body: clone(body) });
      const schedule: Schedule = { id: `schedule-${schedules.length + 1}`, agentId: body.agentId, title: null, prompt: body.prompt,
        timezone: body.timezone, recurrence: body.recurrence, description: `Every day at ${body.recurrence.time}`, revision: 1, paused: false,
        nextRunAt: next(body.recurrence.time)[0]!, nextRunLocal: next(body.recurrence.time)[0]!, catchUpMinutes: 60, overlap: 'skip' };
      schedules = [schedule, ...schedules];
      return clone(schedule);
    },
    pause: async (id, paused) => {
      calls.push({ action: 'v2-schedule-pause', id, paused });
      const s = find(schedules, id);
      Object.assign(s, { paused, nextRunLocal: paused ? null : next(s.recurrence.time)[0], revision: s.revision + 1 });
      return clone(s);
    },
    remove: async id => { calls.push({ action: 'v2-schedule-delete', id }); schedules = schedules.filter(s => s.id !== id); },
    history: async () => [
      { id: 'occ-2', intendedAt: '2026-09-29T08:00:00Z', state: 'expired', reason: 'computer_offline', runId: 'run-review-1', runState: 'failed' },
      { id: 'occ-1', intendedAt: '2026-09-28T08:00:00Z', state: 'skipped', reason: 'previous_run_active', runId: null, runState: null },
    ],
    triggers: {
      list: async agentId => clone(triggers.filter(t => t.agentId === agentId)),
      create: async (body: any) => {
        calls.push({ action: 'v2-trigger-create', body: clone(body) });
        const id = `123e4567-e89b-42d3-a456-00000000070${triggers.length}`;
        const hook = body.kind.startsWith('github.') || body.kind === 'stripe.event'
          ? `https://vibyra.test/api/agents/v2/hooks/${body.kind.split('.')[0]}/${id}` : null;
        const trigger: Trigger = { id, agentId: body.agentId, kind: body.kind, connectionId: body.connectionId ?? null, filter: body.filter,
          promptTemplate: body.promptTemplate, ratePerHour: body.ratePerHour, revision: 1, paused: false, webhookUrl: hook, lastError: null,
          polledAt: null, createdAt: '2026-09-30T12:00:00Z' };
        triggers = [trigger, ...triggers];
        return { trigger: clone(trigger), webhook: hook ? { url: hook, secret: body.kind.startsWith('github.') ? 'fixture-secret-shown-once' : null,
          contentType: 'application/json' } : null };
      },
      update: async (id, body) => {
        calls.push({ action: 'v2-trigger-update', id, body: clone(body) });
        const t = find(triggers, id); t.revision += 1; return clone(t);
      },
      pause: async (id, paused) => { calls.push({ action: 'v2-trigger-pause', id, paused }); const t = find(triggers, id); t.paused = paused; return clone(t); },
      remove: async id => { triggers = triggers.filter(t => t.id !== id); },
      events: async () => [{ id: 'evt-1', eventKey: 'd-1', type: 'issues.opened', state: 'admitted', reason: null, runId: 'run-review-1',
        summary: { number: 12, title: 'Broken link on pricing' }, createdAt: '2026-09-30T10:00:00Z' }],
    },
    connections: async () => [{ id: 'conn-gmail', provider: 'gmail', account: 'me@example.com', health: 'healthy' }],
  };
}
