import test from 'node:test';
import assert from 'node:assert/strict';
import { routinesClient, words } from '../src/components/teammates/routinesClient.ts';
import {
  draftState, formatLocal, newScheduleDraft, occurrenceLabel, previewKey, scheduleBody, scheduleLabel, scheduleProblem,
} from '../../mobile/src/agents/v2/routinesModel.ts';
import { filterSummary, newTriggerDraft, triggerBody, triggerProblem, triggerStatus, webhookSteps } from '../../mobile/src/agents/v2/triggersModel.ts';

const id = '123e4567-e89b-42d3-a456-000000000001';
const recorder = answers => {
  const calls = [];
  const api = async (path, body, method) => { calls.push({ path, body, method }); const answer = answers[path]; if (answer instanceof Error) throw answer; return answer ?? {}; };
  return { calls, client: routinesClient(api) };
};

test('capabilities report everything off on any failure', async () => {
  const off = recorder({ 'agents/v2/capabilities': new Error('503: Agent v2 is off.') });
  assert.deepEqual(await off.client.capabilities(), { enabled: false, routines: false, triggers: false, triggerKinds: [] });
  const on = recorder({ 'agents/v2/capabilities': { enabled: true, routines: true, triggers: true, triggerKinds: ['github.issue', 7] } });
  assert.deepEqual(await on.client.capabilities(), { enabled: true, routines: true, triggers: true, triggerKinds: ['github.issue'] });
  const malformed = recorder({ 'agents/v2/capabilities': { routines: 'yes' } });
  assert.equal((await malformed.client.capabilities()).routines, false);
});

test('schedule requests use the exact contract paths and methods', async () => {
  const schedule = { id, prompt: 'Review issues' };
  const { calls, client } = recorder({ 'agents/v2/schedules/preview': { description: 'Every day at 09:00', next: [{ at: 'a', local: 'b' }] },
    'agents/v2/schedules': { schedule }, [`agents/v2/schedules/${id}/pause`]: { schedule } });
  const draft = { ...newScheduleDraft('Review issues', 'Europe/London', new Date(2026, 8, 30)), type: 'daily' };
  assert.equal((await client.preview('Europe/London', { type: 'daily', time: '09:00' })).description, 'Every day at 09:00');
  await client.createSchedule(scheduleBody(id, draft));
  await client.pauseSchedule(id, true);
  await client.deleteSchedule(id);
  await client.occurrences(id);
  await client.schedules(id);
  assert.deepEqual(calls.map(c => [c.path, c.method ?? (c.body === undefined ? 'GET' : 'POST')]), [
    ['agents/v2/schedules/preview', 'POST'], ['agents/v2/schedules', 'POST'], [`agents/v2/schedules/${id}/pause`, 'POST'],
    [`agents/v2/schedules/${id}`, 'DELETE'], [`agents/v2/schedules/${id}/occurrences?limit=20`, 'GET'], [`agents/v2/schedules?agentId=${id}`, 'GET']]);
  assert.deepEqual(calls[0].body, { timezone: 'Europe/London', recurrence: { type: 'daily', time: '09:00' }, count: 3 });
  assert.deepEqual(calls[1].body, { agentId: id, prompt: 'Review issues', timezone: 'Europe/London', recurrence: { type: 'daily', time: '09:00' } });
  assert.equal(calls[3].body, undefined, 'DELETE carries no body');
});

test('trigger requests: create returns the one-time webhook; Stripe secret is a PATCH with the revision', async () => {
  const trigger = { id, kind: 'stripe.event', revision: 2 };
  const { calls, client } = recorder({ 'agents/v2/triggers': { trigger, webhook: { url: 'https://x/hook', secret: null } },
    [`agents/v2/triggers/${id}`]: { trigger: { ...trigger, revision: 3 } }, [`agents/v2/triggers/${id}/pause`]: { trigger } });
  const created = await client.createTrigger(triggerBody(id, { ...newTriggerDraft('stripe.event'), types: 'invoice.paid, customer.*' }));
  assert.equal(created.webhook.url, 'https://x/hook');
  assert.equal((await client.saveSigningSecret(trigger, 'whsec_abcdefghijklmnop1234')).revision, 3);
  await client.pauseTrigger(id, true); await client.deleteTrigger(id); await client.events(id); await client.connections();
  assert.deepEqual(calls[0].body.filter, { types: ['invoice.paid', 'customer.*'] });
  assert.deepEqual(calls[1], { path: `agents/v2/triggers/${id}`, body: { revision: 2, signingSecret: 'whsec_abcdefghijklmnop1234' }, method: 'PATCH' });
  assert.deepEqual(calls.slice(2).map(c => [c.path, c.method]), [[`agents/v2/triggers/${id}/pause`, undefined], [`agents/v2/triggers/${id}`, 'DELETE'],
    [`agents/v2/triggers/${id}/events?limit=20`, undefined], ['agents/v2/connections', undefined]]);
  await assert.rejects(recorder({ 'agents/v2/triggers': { trigger: null } }).client.createTrigger({}), /invalid trigger/);
});

test('routine words shown on the Mac', () => {
  assert.equal(scheduleLabel({ paused: false, nextRunLocal: '2026-10-01T09:00:00+01:00', timezone: 'Europe/London' }, new Date('2026-09-30T12:00:00Z')),
    'Active · next tomorrow, 09:00');
  assert.equal(scheduleLabel({ paused: false, nextRunLocal: '2026-10-08T09:00:00+01:00', timezone: 'Europe/London' }, new Date('2026-09-30T12:00:00Z')),
    'Active · next Thu 8 Oct, 09:00');
  assert.equal(scheduleLabel({ paused: true, nextRunLocal: null, timezone: 'UTC' }), 'Paused');
  assert.equal(scheduleLabel({ paused: false, nextRunLocal: null, timezone: 'UTC' }), 'Done · no more runs');
  assert.equal(formatLocal('garbage'), '');
  assert.equal(occurrenceLabel({ state: 'expired', reason: 'computer_offline', runState: 'failed' }).label, 'Expired · the selected computer stayed offline');
  assert.equal(occurrenceLabel({ state: 'waiting', reason: null, runState: 'waiting_for_computer' }).label, 'Waiting for the selected computer');
  assert.equal(draftState('Weekly review', [{ prompt: 'Something else' }]), 'draft');
  const d = newScheduleDraft('x', 'Europe/London', new Date(2026, 8, 30));
  assert.equal(scheduleProblem({ ...d, type: 'weekly', weekdays: [] }), 'Choose at least one day.');
  assert.notEqual(previewKey(d), previewKey({ ...d, time: '10:00' }), 'a changed time needs a fresh preview before Save');
  assert.match(triggerProblem({ ...newTriggerDraft('gmail.message') }), /Gmail account/);
  assert.equal(filterSummary({ kind: 'github.issue', filter: { repository: 'acme/web', actions: ['opened'] } }), 'acme/web · opened');
  assert.equal(triggerStatus({ paused: false, lastError: null, ratePerHour: 10 }).label, 'Active · up to 10 runs an hour');
  assert.ok(webhookSteps('github.issue').some(s => s.includes('application/json')));
  assert.equal(words(new Error('409: Choose a connected gmail account.')), 'Choose a connected gmail account.');
});
