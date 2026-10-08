import { RunError, type RunsApi } from '../src/agents/v2/runsApi';
import type { Run, RunEvent } from '../src/agents/v2/runCore';

/** Simulated Agent v2 runs for `?v2` fixtures. No live task, account or Mac is involved. */
export function fixtureRuns(calls: unknown[], query: URLSearchParams): RunsApi {
  const clone = <T,>(value: T): T => structuredClone(value);
  const runs: Run[] = [{ id: 'run-review-1', agentId: 'review', conversationId: 'chat-review', conversationSeq: 1, idempotencyKey: 'fixture-seed-1',
    state: 'waiting_for_approval', stateReason: null, terminal: false, prompt: 'Email the release notes to the team.',
    answer: null, runtime: { provider: 'codex', model: 'fixture-mac-model' }, eventCursor: 1, createdAt: '2026-09-30T09:00:00Z',
    actions: [{ id: 'action-review-1', callId: 'call-1', tool: 'gmail_send', kind: 'write', connectionId: '123e4567-e89b-42d3-a456-00000000c001', provider: 'gmail', account: 'team@example.com', state: 'pending_approval',
      summary: null, arguments: { to: 'team@example.com', subject: 'Release notes', body: 'Version 2 ships today.' },
      fingerprint: 'c'.repeat(64), expiresAt: new Date(Date.now() + 900000).toISOString(), receipt: null }] }];
  const events = new Map<string, RunEvent[]>([['run-review-1', [{ seq: 1, type: 'approval.requested', payload: {} }]]]);
  let admitFailed = false;
  const find = (id: string) => {
    const run = runs.find(r => r.id === id);
    if (!run) throw new RunError('Not found', 404, 'run_not_found');
    return run;
  };
  return {
    probe: async () => ({ mode: 'v2', final: true }),
    admit: async body => {
      calls.push({ action: 'v2-admit', body: clone(body) });
      // `?no-runtime`: no AI account is chosen on the Mac, so admission refuses with the server's fix.
      if (query.has('no-runtime')) throw new RunError('Teammates run on an AI account you choose on your Mac, and none is selected yet.', 409, 'runtime_required',
        { action: 'choose_ai_account', message: 'Open Vibyra on your Mac and choose a Claude Code account in Settings → AI accounts.' });
      let run = runs.find(r => r.idempotencyKey === body.idempotencyKey);
      if (!run) {
        run = { ...clone(runs[0]!), id: `run-${runs.length + 1}`, conversationSeq: runs.length + 1, idempotencyKey: body.idempotencyKey,
          state: 'running', terminal: false, answer: null, prompt: body.prompt, actions: [], eventCursor: 0, createdAt: new Date().toISOString() };
        runs.push(run);
        events.set(run.id, [{ seq: 1, type: 'message.delta', payload: { text: 'Fixture v2 ' } },
          { seq: 2, type: 'message.delta', payload: { text: 'reply.' } }]);
      }
      if (query.has('admit-timeout') && !admitFailed) { admitFailed = true; throw new RunError('Connection interrupted.', 0, null); }
      return clone(run);
    },
    list: async agentId => clone(runs.filter(r => r.agentId === agentId)).reverse(),
    run: async id => clone(find(id)),
    events: async (id, after) => {
      calls.push({ action: 'v2-events', id, after });
      const run = find(id), all = events.get(id) ?? [];
      const sent = run.actions.find(x => x.state === 'approved');
      // The fixture runner sends an approved write once, keeps its receipt and finishes.
      if (sent) {
        Object.assign(sent, { state: 'completed', receipt: { status: 'confirmed', providerResourceId: 'msg-1', summary: 'Sent to team@example.com' } });
        Object.assign(run, { state: 'completed', terminal: true, answer: 'Sent the release notes to the team.' });
      }
      // Once the client has read every delta, the fixture runner completes the run.
      if (run.state === 'running' && after >= all.length && all.length > 1)
        Object.assign(run, { state: 'completed', terminal: true, answer: all.map(e => e.payload.text).join('') });
      return { events: clone(all.filter(e => e.seq > after)), nextCursor: all.length, state: run.state, terminal: run.terminal, latestSeq: all.length };
    },
    cancel: async id => {
      calls.push({ action: 'v2-cancel', id });
      Object.assign(find(id), { state: 'cancelled', terminal: true });
      return clone(find(id));
    },
    decide: async (id, fingerprint, decision) => {
      calls.push({ action: 'v2-decision', id, fingerprint, decision });
      const run = runs.find(r => r.actions.some(a => a.id === id))!;
      const action = run.actions.find(a => a.id === id)!;
      Object.assign(action, { state: decision === 'allow' ? 'approved' : 'declined', fingerprint: null, expiresAt: null });
      run.state = 'running';
    },
  };
}
