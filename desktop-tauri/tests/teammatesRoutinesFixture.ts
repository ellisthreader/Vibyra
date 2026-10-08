/** Simulated Agent v2 routines/triggers for the Mac teammates fixture (`?v2`). No live schedule, webhook or account. */
export function routinesFixture() {
  const state = { calls: [] as { path: string; body: any; method?: string }[], schedules: [] as any[], triggers: [] as any[] };
  const uid = (n: number) => `223e4567-e89b-42d3-a456-${String(n).padStart(12, '0')}`;
  let next = 1;
  const local = (time: string) => `2026-10-01T${time}:00+01:00`;
  const request = (path: string, body: any, method?: string): unknown => {
    state.calls.push({ path, body: structuredClone(body), method });
    if (path === 'agents/v2/capabilities') return { enabled: true, routines: true, triggers: true,
      triggerKinds: ['github.issue', 'github.pull_request', 'stripe.event', 'gmail.message', 'calendar.event_soon'] };
    if (path === 'agents/v2/connections') return { connections: [{ id: uid(900), provider: 'gmail', account: 'me@example.test', health: 'healthy' }] };
    if (path === 'agents/v2/schedules/preview') {
      const t = body.recurrence.time;
      return { description: body.recurrence.type === 'daily' ? `Every day at ${t}` : `Scheduled at ${t}`,
        next: [local(t), `2026-10-02T${t}:00+01:00`, `2026-10-03T${t}:00+01:00`].map(l => ({ at: l, local: l })) };
    }
    if (path.startsWith('agents/v2/schedules?')) return { schedules: structuredClone(state.schedules) };
    if (path === 'agents/v2/schedules' && body) {
      const s = { id: uid(next++), agentId: body.agentId, conversationId: null, title: null, prompt: body.prompt, timezone: body.timezone,
        recurrence: body.recurrence, description: `Every day at ${body.recurrence.time}`, revision: 1, paused: false,
        nextRunAt: local(body.recurrence.time), nextRunLocal: local(body.recurrence.time), catchUpMinutes: 60, overlap: 'skip' };
      state.schedules.unshift(s); return { schedule: structuredClone(s) };
    }
    const sched = /^agents\/v2\/schedules\/([^/?]+)(\/pause|\/occurrences\?limit=\d+)?$/.exec(path);
    if (sched) {
      const s = state.schedules.find(x => x.id === sched[1]); if (!s) throw '404: Routine not found.';
      if (method === 'DELETE') { state.schedules = state.schedules.filter(x => x !== s); return { ok: true }; }
      if (sched[2] === '/pause') { Object.assign(s, { paused: body.paused, nextRunLocal: body.paused ? null : s.nextRunAt }); return { schedule: structuredClone(s) }; }
      return { occurrences: [
        { id: uid(800), scheduleId: s.id, revision: 1, intendedAt: '2026-09-30T08:00:00Z', state: 'expired', reason: 'computer_offline', runId: uid(801), runState: 'failed' },
        { id: uid(802), scheduleId: s.id, revision: 1, intendedAt: '2026-09-29T08:00:00Z', state: 'admitted', reason: null, runId: uid(803), runState: 'completed' }] };
    }
    if (path.startsWith('agents/v2/triggers?')) return { triggers: structuredClone(state.triggers) };
    if (path === 'agents/v2/triggers' && body) {
      const id = uid(next++), hook = body.kind.startsWith('github.') || body.kind === 'stripe.event';
      const t = { id, agentId: body.agentId, kind: body.kind, connectionId: body.connectionId ?? null, filter: body.filter, promptTemplate: body.promptTemplate,
        ratePerHour: body.ratePerHour, runtimeId: null, revision: 1, paused: false, lastError: null, polledAt: null, createdAt: '2026-09-30T12:00:00Z',
        webhookUrl: hook ? `https://api.example.test/api/agents/v2/hooks/${body.kind.split('.')[0]}/${id}` : null };
      state.triggers.unshift(t);
      return { trigger: structuredClone(t), webhook: hook ? { url: t.webhookUrl, secret: body.kind === 'stripe.event' ? null : 'fixture-secret-shown-once-0123456789abcdef', contentType: 'application/json' } : null };
    }
    const trig = /^agents\/v2\/triggers\/([^/?]+)(\/pause|\/events\?limit=\d+)?$/.exec(path);
    if (trig) {
      const t = state.triggers.find(x => x.id === trig[1]); if (!t) throw '404: Trigger not found.';
      if (method === 'DELETE') { state.triggers = state.triggers.filter(x => x !== t); return { ok: true }; }
      if (method === 'PATCH') { if (body.revision !== t.revision) throw '409: This trigger changed elsewhere.'; t.revision++; return { trigger: structuredClone(t) }; }
      if (trig[2] === '/pause') { t.paused = body.paused; return { trigger: structuredClone(t) }; }
      return { events: [{ id: uid(700), triggerId: t.id, eventKey: 'delivery-1', type: 'issues.opened', state: 'admitted', reason: null, runId: uid(701),
        summary: { title: 'Checkout button overlaps footer', number: 42 }, createdAt: '2026-09-30T11:00:00Z' }] };
    }
    return undefined;
  };
  return { state, request };
}
