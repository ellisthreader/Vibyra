import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { previewReadinessScript } from '../src/preview/readinessScript';
import { previewDetail } from '../src/preview/previewProblem';

function observer(root: { innerText: string; querySelector(): object | null }) {
  const events: { kind: string }[] = [];
  const scheduled: (() => void)[] = [];
  const listeners: Record<string, (event: { persisted: boolean }) => void> = {};
  let now = 0;
  const window = { top: null as unknown, ReactNativeWebView: { postMessage: (value: string) => events.push(JSON.parse(value)) } };
  window.top = window;
  vm.runInNewContext(previewReadinessScript, { window,
    document: { readyState: 'interactive', querySelector: () => root, body: { innerText: 'Deprecated: PHP warning' } },
    location: { href: 'http://127.0.0.1:1234/' }, Date: { now: () => now },
    addEventListener: (name: string, fn: (event: { persisted: boolean }) => void) => { listeners[name] = fn; },
    requestAnimationFrame: (fn: () => void) => fn(),
    setTimeout: (fn: () => void) => scheduled.push(fn), clearTimeout() {},
  });
  return { events, restore: () => listeners.pageshow({ persisted: true }),
    tick: (at: number) => { now = at; scheduled.splice(0).forEach(fn => fn()); } };
}

test('PHP warning text ahead of an empty Inertia root is not a rendered app', () => {
  const root = { innerText: '', querySelector: () => null };
  const check = observer(root);
  assert.equal(check.events.length, 0);
  root.innerText = 'Welcome to Bear Lane';
  check.tick(100);
  assert.equal(check.events[0].kind, 'ready');
});
test('a document whose application never draws reports a bounded failure', () => {
  const check = observer({ innerText: '', querySelector: () => null });
  check.tick(25000);
  assert.equal(check.events[0].kind, 'failed');
});
test('diagnostics never display bootstrap tokens or query credentials', () => {
  assert.equal(previewDetail('Failed /_vibyra_preview/private?secret=value'), 'Failed /[private-preview]');
});
test('WebKit history restoration announces a rendered page again, but never a failed document', () => {
  const ready = observer({ innerText: 'Website', querySelector: () => null });
  ready.restore();
  assert.deepEqual(ready.events.map(event => event.kind), ['ready', 'ready']);
  const failed = observer({ innerText: '', querySelector: () => null });
  failed.tick(25000);
  failed.restore();
  assert.deepEqual(failed.events.map(event => event.kind), ['failed']);
});
