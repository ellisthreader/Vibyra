import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEntitlements } from '../src/vibes/api';
import { planLimitFrom } from '../src/vibes/planLimit';
import { benefitsFor, changesFor } from '../src/vibes/plans';
import { subscriptionState } from '../src/settings/subscription';
import type { VibesProduct } from '../src/vibes/types';
import { free, wallet } from './vibes.test';

const pro = { maxProjects: null, concurrentReplies: 3, fullCatalogue: true, remoteAccess: true,
  sessionCredits: 400, weekCredits: 1000, maxTerminals: null, safeWorktrees: true, agents: true, preview: true, review: true };
const offer: VibesProduct = { id: 'app.vibyra.membership.pro.monthly.v2', plan: 'pro_v2', credits: 300, pence: 1999, kind: 'subscription' };

test('a limit from the computer becomes a Pro offer, and anything else stays an error', () => {
  assert.equal(planLimitFrom('plan-limit:projects: Free includes 1 project.')?.feature, 'projects');
  assert.equal(planLimitFrom('plan-limit:preview: Preview is part of Vibyra Pro.')?.feature, 'preview');
  assert.deepEqual(planLimitFrom('plan-limit:terminals: Free runs 2 terminals at once. Close one, or get Vibyra Pro for unlimited terminals.'),
    { feature: 'terminals', message: 'Free runs 2 terminals at once. Close one, or get Vibyra Pro for unlimited terminals.' });
  assert.equal(planLimitFrom('The computer could not start this terminal.'), null);
});

test('a backend that sends no workspace limits reads as open, never as a guessed limit', () => {
  const old = normalizeEntitlements({ maxProjects: 1, concurrentReplies: 1, fullCatalogue: true, remoteAccess: false, sessionCredits: 60, weekCredits: 150 });
  assert.deepEqual([old.maxTerminals, old.safeWorktrees, old.agents], [null, true, true]);
  const limited = normalizeEntitlements({ ...free });
  assert.deepEqual([limited.maxTerminals, limited.safeWorktrees, limited.agents, limited.preview, limited.review], [2, false, false, false, false]);
});

test('Pro is sold on the table: terminals, Safe mode, Agents, Vibyra Cloud and tokens', () => {
  const free$ = { ...wallet, version: 2 as const, entitlements: free, planEntitlements: { pro_v2: pro }, remoteAccessLive: true };
  const rows = benefitsFor(offer, free$).map(b => b.label);
  for (const label of ['300 Vibyra tokens every month', 'Unlimited projects', 'Unlimited terminals at once', 'Live website Preview', 'Review every change', 'Safe mode worktrees',
    'Agents that keep working while you’re away', 'Vibyra Cloud: your computer, from anywhere', 'Tokens that never expire, even if you cancel'])
    assert.ok(rows.includes(label), label);
  assert.ok(!rows.some(label => /linked AI project|replies at once/i.test(label)), 'no linked-project or task counts');
  const changes = changesFor(offer, free$);
  assert.deepEqual(changes.find(c => c.label === 'Terminals at once'), { label: 'Terminals at once', from: '2', to: 'Unlimited' });
  assert.deepEqual(changes.find(c => c.label === 'Your computer'), { label: 'Your computer', from: 'Same Wi-Fi', to: 'From anywhere', pending: false });
  assert.ok(changes.some(c => c.label === 'Agents') && changes.some(c => c.label === 'Safe mode worktrees'));
  assert.deepEqual(changes.find(c => c.label === 'Projects'), { label: 'Projects', from: '1', to: 'Unlimited' });
  assert.ok(changes.some(c => c.label === 'Preview') && changes.some(c => c.label === 'Review'));
  assert.ok(!changes.some(c => c.label === 'Replies at once' || c.label === 'Projects at once'));
});

test('the free Pro trial is named as a trial with nothing to manage', () => {
  const view = subscriptionState(null, { plan: 'pro_v2', paidUntil: '2026-10-12T00:00:00Z', membership: { provider: 'trial', trial: true } });
  assert.equal(view.plan, 'Pro trial');
  assert.equal(view.state, 'Ends on 12 October 2026');
  assert.equal(view.manage, null);
  assert.equal(view.billing, null);
});
