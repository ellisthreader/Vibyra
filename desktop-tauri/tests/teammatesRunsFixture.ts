import type { Run, RunEvent } from '../../mobile/src/agents/v2/runCore.ts';

/** Simulated Agent v2 runs for the Mac teammates fixture (`?v2`). No live task or account. */
export function runsFixture(agentId: string, chatId: string) {
  const state = { admits: [] as any[], decisions: [] as any[], cancels: 0, afters: [] as number[], ambiguous: false };
  const runs: Run[] = [{ id: 'v2-run-1', agentId, conversationId: chatId, conversationSeq: 1, idempotencyKey: 'fixture-seed-1',
    state: 'waiting_for_approval', stateReason: null, terminal: false, prompt: 'Email the release notes to the team.', answer: null,
    runtime: { model: 'fixture-mac-model' }, eventCursor: 1, createdAt: '2026-09-30T09:00:00Z',
    actions: [{ id: 'v2-action-1', callId: 'call-1', tool: 'gmail_send', kind: 'write', connectionId: '123e4567-e89b-42d3-a456-00000000c001', provider: 'gmail', account: 'team@example.com', state: 'pending_approval', summary: null,
      arguments: { to: 'team@example.com', subject: 'Release notes' }, fingerprint: 'c'.repeat(64),
      expiresAt: new Date(Date.now() + 900000).toISOString(), receipt: null }] }];
  const events = new Map<string, RunEvent[]>();
  const find = (id: string) => { const run = runs.find(r => r.id === id); if (!run) throw '404: Not found'; return run; };
  const request = (path: string, body: any): unknown => {
    if (path === 'agents/v2/runtimes') return { runtimes: [] };
    if (path === 'agents/v2/runs' && body) {
      state.admits.push(structuredClone(body));
      let run = runs.find(r => r.idempotencyKey === body.idempotencyKey);
      if (!run) {
        run = { ...structuredClone(runs[0]), id: `v2-run-${runs.length + 1}`, idempotencyKey: body.idempotencyKey, prompt: body.prompt,
          state: 'running', terminal: false, answer: null, actions: [], eventCursor: 0, createdAt: new Date().toISOString() };
        runs.push(run);
        events.set(run.id, [{ seq: 1, type: 'message.delta', payload: { text: 'Fixture v2 ' } }, { seq: 2, type: 'message.delta', payload: { text: 'reply.' } }]);
      }
      if (state.ambiguous) { state.ambiguous = false; throw 'Connection interrupted. Refresh to check the outcome.'; }
      return { run: structuredClone(run), replayed: false };
    }
    if (path.startsWith('agents/v2/runs?')) return { runs: structuredClone(runs).reverse() };
    const events$ = /^agents\/v2\/runs\/([^/]+)\/events\?after=(\d+)/.exec(path);
    if (events$) {
      const run = find(events$[1]), after = Number(events$[2]), all = events.get(run.id) ?? [];
      state.afters.push(after);
      const sent = run.actions.find(a => a.state === 'approved');
      if (sent) { Object.assign(sent, { state: 'completed', receipt: { status: 'confirmed', summary: 'Sent to team@example.com' } }); Object.assign(run, { state: 'completed', terminal: true, answer: 'Sent the release notes.' }); }
      if (run.state === 'running' && all.length > 1 && after >= all.length) Object.assign(run, { state: 'completed', terminal: true, answer: 'Fixture v2 reply.' });
      return { events: all.filter(e => e.seq > after), nextCursor: all.length, state: run.state, terminal: run.terminal, latestSeq: all.length };
    }
    const cancel = /^agents\/v2\/runs\/([^/]+)\/cancel$/.exec(path);
    if (cancel) { state.cancels++; return { run: Object.assign(find(cancel[1]), { state: 'cancelled', terminal: true }) }; }
    const one = /^agents\/v2\/runs\/([^/?]+)$/.exec(path);
    if (one) return { run: structuredClone(find(one[1])) };
    const decision = /^agents\/v2\/actions\/([^/]+)\/decision$/.exec(path);
    if (decision) {
      state.decisions.push({ id: decision[1], ...body });
      const run = runs.find(r => r.actions.some(a => a.id === decision[1]))!;
      Object.assign(run.actions.find(a => a.id === decision[1])!, { state: body.decision === 'allow' ? 'approved' : 'declined', fingerprint: null, expiresAt: null });
      run.state = 'running';
      return { action: {} };
    }
    return undefined;
  };
  return { state, request };
}
