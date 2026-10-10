import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRoutinesApi } from '../src/agents/v2/routinesApi';
import {
  draftState, formatInstant, formatLocal, newScheduleDraft, occurrenceLabel, parseCapabilities, previewKey, recurrenceOf,
  scheduleBody, scheduleLabel, scheduleProblem,
} from '../src/agents/v2/routinesModel';
import {
  eventLabel, eventTitle, filterSummary, newTriggerDraft, triggerBody, triggerProblem, triggerStatus, webhookSteps,
} from '../src/agents/v2/triggersModel';

const now = new Date('2026-09-30T12:00:00Z');

test('next-run display reads the server wall clock, with today/tomorrow in the schedule zone', () => {
  assert.equal(formatLocal('2026-10-05T18:15:00+01:00'), 'Mon 5 Oct, 18:15');
  assert.equal(formatLocal('2026-09-30T18:15:00+01:00', '2026-09-30'), 'today, 18:15');
  assert.equal(formatLocal('2026-10-01T09:00:00+01:00', '2026-09-30'), 'tomorrow, 09:00');
  assert.equal(formatLocal('2026-01-01T00:00:00-05:00', '2025-12-31'), 'tomorrow, 00:00');
  assert.equal(formatLocal(null), '');
  assert.equal(formatInstant('2026-10-01T08:00:00Z', 'Europe/London'), 'Thu 1 Oct, 09:00');
});

test('state labels: active with next run, paused, done', () => {
  const base = { paused: false, nextRunLocal: '2026-10-01T09:00:00+01:00', timezone: 'Europe/London' };
  assert.equal(scheduleLabel(base, now), 'Active · next tomorrow, 09:00');
  assert.equal(scheduleLabel({ ...base, nextRunLocal: '2026-10-08T09:00:00+01:00' }, now), 'Active · next Thu 8 Oct, 09:00');
  assert.equal(scheduleLabel({ ...base, paused: true }, now), 'Paused');
  assert.equal(scheduleLabel({ ...base, nextRunLocal: null }, now), 'Done · no more runs');
});

test('occurrence history words: ran, skipped, waiting for the selected computer, expired with reason', () => {
  assert.deepEqual(occurrenceLabel({ state: 'admitted', reason: null, runState: 'completed' }), { label: 'Ran', tone: 'ok' });
  assert.deepEqual(occurrenceLabel({ state: 'admitted', reason: null, runState: 'waiting_for_computer' }), { label: 'Waiting for the selected computer', tone: 'warn' });
  assert.deepEqual(occurrenceLabel({ state: 'waiting', reason: null, runState: null }), { label: 'Waiting for the selected computer', tone: 'warn' });
  assert.equal(occurrenceLabel({ state: 'skipped', reason: 'previous_run_active', runState: null }).label, 'Skipped · the last run was still going');
  assert.equal(occurrenceLabel({ state: 'expired', reason: 'computer_offline', runState: null }).label, 'Expired · the selected computer stayed offline');
  assert.equal(occurrenceLabel({ state: 'failed', reason: 'runtime_required', runState: null }).label, 'Failed · no computer is set up to run it');
  assert.equal(occurrenceLabel({ state: 'failed', reason: 'something_new', runState: null }).label, 'Failed · something new');
});

test('drafts are never auto-converted: only an exact saved prompt marks one scheduled', () => {
  const schedules = [{ prompt: 'Every Friday, list open decisions.' }];
  assert.equal(draftState('Every Friday, list open decisions.', schedules), 'scheduled');
  assert.equal(draftState('  Every Friday, list open decisions.\n', schedules), 'scheduled');
  assert.equal(draftState('Every Monday, list open decisions.', schedules), 'draft');
  assert.equal(draftState('', schedules), 'draft');
  assert.equal(draftState('Anything', []), 'draft');
});

test('schedule form: defaults, validation, recurrence and preview key', () => {
  const draft = newScheduleDraft('Review notes', 'Europe/London', new Date(2026, 8, 30, 15));
  assert.deepEqual({ type: draft.type, time: draft.time, date: draft.date, weekdays: draft.weekdays }, { type: 'daily', time: '09:00', date: '2026-10-01', weekdays: [4] });
  assert.equal(scheduleProblem(draft), null);
  assert.match(scheduleProblem({ ...draft, time: '9am' })!, /24-hour/);
  assert.match(scheduleProblem({ ...draft, type: 'weekly', weekdays: [] })!, /at least one day/);
  assert.match(scheduleProblem({ ...draft, type: 'once', date: '1/10/2026' })!, /date/);
  assert.match(scheduleProblem({ ...draft, timezone: 'London time' })!, /timezone/);
  assert.match(scheduleProblem({ ...draft, prompt: '  ' })!, /Describe/);
  assert.deepEqual(recurrenceOf({ ...draft, type: 'weekly', weekdays: [5, 1] }), { type: 'weekly', weekdays: [1, 5], time: '09:00' });
  assert.deepEqual(recurrenceOf({ ...draft, type: 'once' }), { type: 'once', date: '2026-10-01', time: '09:00' });
  assert.notEqual(previewKey(draft), previewKey({ ...draft, time: '10:00' }), 'a changed time needs a fresh preview');
  assert.equal(previewKey(draft), previewKey({ ...draft, prompt: 'Other words' }), 'the prompt does not change the preview');
  assert.deepEqual(scheduleBody('agent-1', draft), { agentId: 'agent-1', prompt: 'Review notes', timezone: 'Europe/London', recurrence: { type: 'daily', time: '09:00' } });
});

test('capabilities: malformed or failing answers keep everything off', async () => {
  assert.deepEqual(parseCapabilities(null), { enabled: false, routines: false, triggers: false, triggerKinds: [] });
  assert.equal(parseCapabilities({ routines: 'yes' }).routines, false);
  const failing = createRoutinesApi('https://x.test', () => 'token', (async () => { throw new Error('offline'); }) as typeof fetch);
  assert.deepEqual(await failing.capabilities(), { enabled: false, routines: false, triggers: false, triggerKinds: [] });
});

test('routines client sends the contract requests and methods', async () => {
  const seen: { method: string; url: string; body: unknown }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    seen.push({ method: init.method ?? 'GET', url, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const data = url.includes('/triggers/') && init.method === 'PATCH' ? { trigger: { id: 't-1' } } : url.endsWith('/pause') ? { schedule: { id: 's-1' } }
      : url.endsWith('/preview') ? { description: 'Every day at 09:00', next: [{ at: 'a', local: 'b' }] } : { ok: true };
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const api = createRoutinesApi('https://x.test', () => 'token', fetcher);
  assert.equal((await api.preview('Europe/London', { type: 'daily', time: '09:00' })).description, 'Every day at 09:00');
  await api.pause('s-1', true); await api.remove('s-1');
  await api.triggers.update('t-1', { revision: 2, signingSecret: 'whsec_abcdefghijklmnop' }); await api.triggers.remove('t-1');
  assert.deepEqual(seen.map(r => `${r.method} ${r.url.replace(/^.*\/agents\/v2\//, '')}`),
    ['POST schedules/preview', 'POST schedules/s-1/pause', 'DELETE schedules/s-1', 'PATCH triggers/t-1', 'DELETE triggers/t-1']);
  assert.deepEqual(seen[0]!.body, { timezone: 'Europe/London', recurrence: { type: 'daily', time: '09:00' }, count: 3 });
  assert.deepEqual(seen[3]!.body, { revision: 2, signingSecret: 'whsec_abcdefghijklmnop' });
});

test('triggers: filters, validation, status and webhook steps', () => {
  const gh = { ...newTriggerDraft('github.issue'), repository: 'acme/site', labels: 'bug, urgent' };
  assert.equal(triggerProblem(gh), null);
  assert.deepEqual(triggerBody('a-1', gh).filter, { repository: 'acme/site', actions: ['opened'], labels: ['bug', 'urgent'] });
  assert.match(triggerProblem({ ...gh, repository: 'acme' })!, /owner\/repo/);
  const stripe = newTriggerDraft('stripe.event');
  assert.match(triggerProblem(stripe)!, /Stripe event type/);
  assert.equal(triggerProblem({ ...stripe, types: 'invoice.paid, customer.*' }), null);
  assert.match(triggerProblem({ ...stripe, types: 'invoice.paid', signingSecret: 'sk_live' })!, /whsec_/);
  assert.match(triggerProblem(newTriggerDraft('gmail.message'))!, /Gmail account/);
  const gmail = { ...newTriggerDraft('gmail.message'), connectionId: 'c-1', query: 'from:bank' };
  assert.deepEqual(triggerBody('a-1', gmail), { agentId: 'a-1', kind: 'gmail.message', promptTemplate: gmail.promptTemplate,
    filter: { query: 'from:bank', pollMinutes: 5 }, ratePerHour: 10, connectionId: 'c-1' });
  assert.match(triggerProblem({ ...newTriggerDraft('calendar.event_soon'), connectionId: 'c', leadMinutes: 2 })!, /5 to 240/);
  assert.equal(filterSummary({ kind: 'github.pull_request', filter: { actions: ['opened'] } }), 'Any repository · opened');
  assert.equal(filterSummary({ kind: 'gmail.message', filter: { query: 'from:bank', pollMinutes: 10 } }), '“from:bank” · every 10 min');
  assert.equal(triggerStatus({ paused: false, lastError: null, ratePerHour: 10 }).label, 'Active · up to 10 runs an hour');
  assert.equal(triggerStatus({ paused: false, lastError: 'grant_revoked', ratePerHour: 1 }).label, 'Stopped · access was removed');
  assert.ok(webhookSteps('github.issue').some(s => s.includes('Payload URL: the webhook URL above')));
  assert.ok(webhookSteps('stripe.event', ['invoice.paid']).some(s => s.includes('invoice.paid')));
  assert.equal(eventLabel({ state: 'skipped', reason: 'rate_limited' }).label, 'Skipped · hourly cap reached');
  assert.equal(eventTitle({ type: 'issues.opened', summary: { number: 12, title: 'Broken link' } }), '#12 Broken link');
});
