import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validPreviewRunnable, validRunApproval, validRunSummary, type PreviewRunnable } from '../src/preview/runnable';
import { runViewTarget } from '../src/preview/runOpen';
import type { PreviewTarget } from '../src/preview/types';
import { presentConversation } from '../src/state/presentConversation';

const row = {
  projectId: 'hke', targetId: '.::desktop-rust-dev', name: 'HKE desktop', framework: 'tauri',
  command: 'npm run rust:dev', cwd: 'HKE', body: 'tauri dev', approvalRequired: true, changed: false,
  commandVersion: '0123456789abcdef', runState: 'building', stage: 'compile',
  logTail: ['Compiling hke v0.1.0'], error: null, runId: 'a'.repeat(32), windowGrantId: null, autoOpen: false,
};

test('a well-formed runnable row is accepted', () => {
  assert.equal(validPreviewRunnable(row), true);
  const { stage: _stage, logTail: _tail, error: _error, runId: _run, windowGrantId: _grant, autoOpen: _auto, ...minimal } = row;
  assert.equal(validPreviewRunnable({ ...minimal, runState: 'idle', command: null, body: null }), true);
  assert.equal(validPreviewRunnable({ ...row, runState: 'ready', windowGrantId: 'b'.repeat(32), autoOpen: true }), true);
});

test('malformed runnable rows are rejected', () => {
  for (const targetId of ['', 'bad target', 'a/b', '<script>', 'x'.repeat(201)]) {
    assert.equal(validPreviewRunnable({ ...row, targetId }), false, targetId);
  }
  for (const runState of ['running', 'READY', '', null]) {
    assert.equal(validPreviewRunnable({ ...row, runState }), false, String(runState));
  }
  for (const logTail of [['1', '2', '3', '4'], ['x'.repeat(201)], 'one line', [1]]) {
    assert.equal(validPreviewRunnable({ ...row, logTail }), false, JSON.stringify(logTail).slice(0, 30));
  }
  for (const id of ['untrusted', 'A'.repeat(32), 'a'.repeat(31), 42]) {
    assert.equal(validPreviewRunnable({ ...row, windowGrantId: id }), false, `grant ${id}`);
    assert.equal(validPreviewRunnable({ ...row, runId: id }), false, `run ${id}`);
  }
  assert.equal(validPreviewRunnable({ ...row, command: 'x'.repeat(301) }), false);
  assert.equal(validPreviewRunnable({ ...row, commandVersion: 'abc' }), false);
  assert.equal(validPreviewRunnable({ ...row, approvalRequired: 'yes' }), false);
  assert.equal(validPreviewRunnable({ ...row, projectId: '' }), false);
  assert.equal(validPreviewRunnable(null), false);
});

test('preview.run answers are either an approval to show or a run summary', () => {
  const approval = { approvalRequired: true, changed: true, name: 'HKE desktop', command: 'npm run rust:dev',
    cwd: 'HKE', body: 'tauri dev', commandVersion: 'fedcba9876543210', targetId: '.::desktop-rust-dev' };
  assert.equal(validRunApproval(approval), true);
  assert.equal(validRunApproval({ ...approval, commandVersion: 'nope' }), false);
  const summary = { runId: 'c'.repeat(32), targetId: '.::desktop-rust-dev', name: 'HKE desktop', runState: 'building',
    stage: null, logTail: [], error: null };
  assert.equal(validRunSummary(summary), true);
  assert.equal(validRunSummary({ ...summary, runState: 'launched' }), false);
  assert.equal(validRunSummary(approval), false);
});

test('an agent run request reaches the approval dock only when well formed', () => {
  const base = { id: 'p1', turnId: 't1', kind: 'permission' as const, status: 'pending', title: 'Run this app on your computer?',
    allowLabel: 'Run', choices: ['decline', 'accept'], detail: 'npm run rust:dev\ntauri dev', scope: 'HKE' };
  const [shown] = presentConversation([{ ...base, runApp: { name: 'HKE desktop', command: 'npm run rust:dev', cwd: 'HKE', body: 'tauri dev' } }]);
  assert.equal(shown.kind === 'permission' && shown.runApp?.command, 'npm run rust:dev');
  assert.equal(shown.kind === 'permission' && shown.allowLabel, 'Run');
  const [plain] = presentConversation([{ ...base, runApp: { name: 3 } as never }]);
  assert.equal(plain.kind === 'permission' && plain.runApp, undefined);
});

test('listPreviews drops malformed runnable rows and keeps runnables off old computers', async () => {
  const { previewActions } = await import('../src/state/previewActions');
  let answer: Record<string, unknown> = {};
  const store = { state: { status: 'connected', previewAvailable: true }, epoch: 1, assertCurrent() {},
    deps: { rpc: { request: async () => answer } } };
  const list = previewActions(store as never).listPreviews;
  answer = { targets: [], previewRunV1: true, runnable: [row, { ...row, targetId: 'bad target' }, { ...row, runState: 'x' }] };
  assert.deepEqual((await list()).runnable, [row]);
  answer = { targets: [], runnable: [row] };
  assert.deepEqual((await list()).runnable, []);
});

test('View opens this phone\'s own window, else the only app window, and never guesses', () => {
  const window = (letter: string): PreviewTarget => ({ grantId: letter.repeat(32), projectId: 'hke',
    targetId: `native-window:4:${letter.charCodeAt(0)}:view`, name: 'HKE', running: true });
  const site: PreviewTarget = { grantId: 'c'.repeat(32), projectId: 'hke', targetId: 'auto-port:5173', running: true };
  const run = (patch: Partial<PreviewRunnable>) => ({ ...row, ...patch }) as PreviewRunnable;
  // Its own grant wins, listed or not.
  assert.equal(runViewTarget(run({ runState: 'ready', windowGrantId: 'b'.repeat(32) }), [window('a'), window('b')])?.grantId, 'b'.repeat(32));
  assert.equal(runViewTarget(run({ runState: 'waiting_for_window', windowGrantId: 'd'.repeat(32) }), [])?.grantId, 'd'.repeat(32));
  // Started elsewhere: the project's single window is its window; two are ambiguous; a site is not a window.
  assert.equal(runViewTarget(run({ runState: 'ready' }), [site, window('a')])?.grantId, 'a'.repeat(32));
  assert.equal(runViewTarget(run({ runState: 'ready' }), [window('a'), window('b')]), null);
  assert.equal(runViewTarget(run({ runState: 'ready' }), [site]), null);
  // Only a running app has a window to view.
  assert.equal(runViewTarget(run({ runState: 'building' }), [window('a')]), null);
  assert.equal(runViewTarget(run({ runState: 'idle' }), [window('a')]), null);
});

test('website runs open their exact website grant only after readiness', () => {
  const site = { ...row, kind: 'web' as const, windowGrantId: 'd'.repeat(32), runState: 'building' as const };
  assert.equal(runViewTarget(site, []), null);
  const ready = runViewTarget({ ...site, runState: 'ready' }, []);
  assert.equal(ready?.kind, 'web');
  assert.equal(ready?.targetId, site.targetId);
});
