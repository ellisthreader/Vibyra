import test from 'node:test';
import assert from 'node:assert/strict';
import { previewRunRows, previewTargetMatchesProject, previewTargetRunning } from '../src/preview/targetMatch';

test('approved desktop Preview appears in a shared chat for the same Mac folder', () => {
  const projects = [
    { id: 'desktop-hke', path: '~/Desktop/HKE' },
    { id: 'chat-hke', path: '/Users/ellis/Desktop/HKE' },
    { id: 'other', path: '/Users/ellis/Desktop/Other' },
  ];
  const target = { projectId: 'desktop-hke' };
  assert.equal(previewTargetMatchesProject(target, 'desktop-hke', projects), true);
  assert.equal(previewTargetMatchesProject(target, 'chat-hke', projects), true);
  assert.equal(previewTargetMatchesProject(target, 'other', projects), false);
  assert.equal(previewTargetMatchesProject(target, 'missing', projects), false);
});

test('chat advertises only a running approved browser target', () => {
  assert.equal(previewTargetRunning({ targetId: 'auto-port:8001', running: true }), true);
  assert.equal(previewTargetRunning({ targetId: 'attached-port:8001', running: false }), false);
  assert.equal(previewTargetRunning({ targetId: 'managed:website', running: true }), true);
  assert.equal(previewTargetRunning({ targetId: 'managed:website', running: false }), false);
  assert.equal(previewTargetRunning({ targetId: 'attached-port:8001' }), false);
  assert.equal(previewTargetRunning({ targetId: 'auto-port:8001', running: false }), false);
  assert.equal(previewTargetRunning({ targetId: 'auto-port:8001' }), true);
});

test('a matching folder suffix cannot advertise another project’s site', () => {
  const projects = [
    { id: 'site', path: '~/Desktop/Site' },
    { id: 'backup', path: '/Volumes/Backup/Desktop/Site' },
    { id: 'nested', path: '/Users/ellis/Archive/Desktop/Site' },
    { id: 'sibling', path: '/Users/ellis/Desktop/Site-copy' },
    { id: 'child', path: '/Users/ellis/Desktop/Site/child' },
  ];
  for (const id of ['backup', 'nested', 'sibling', 'child']) {
    assert.equal(previewTargetMatchesProject({ projectId: 'site' }, id, projects), false);
    assert.equal(previewTargetMatchesProject({ projectId: id }, 'site', projects), false);
  }
  assert.equal(previewTargetMatchesProject({ projectId: '' }, '', projects), false);
});

test('a site is named by the address a developer knows it by', async () => {
  const { previewAddress } = await import('../src/preview/targetMatch');
  assert.equal(previewAddress({ targetId: 'auto-port:5173' }), 'localhost:5173');
  assert.equal(previewAddress({ targetId: 'attached-port:8001' }), 'localhost:8001');
  assert.equal(previewAddress({ targetId: 'managed:web' }), null);
});

test('a folder open as two projects shows each app once, under the project that can run it', () => {
  const projects = [
    { id: 'desktop-hke', path: '~/Desktop/HKE' },
    { id: 'chat-hke', path: '/Users/ellis/Desktop/HKE' },
    { id: 'other', path: '/Users/ellis/Desktop/Other' },
  ];
  const row = (projectId: string, targetId: string, approvalRequired: boolean) => ({ projectId, targetId, approvalRequired });
  const rows = [
    row('desktop-hke', 'a', false), row('chat-hke', 'a', true), // approved elsewhere beats asking here
    row('desktop-hke', 'b', true), row('chat-hke', 'b', true), // both ask: the visible project's own
    row('other', 'a', false),
    row('chat-hke', 'c', false), row('desktop-hke', 'c', false), // both approved: the visible project's own
  ];
  const shown = previewRunRows(rows, 'chat-hke', projects);
  assert.deepEqual(shown.map(item => `${item.projectId}:${item.targetId}`), ['desktop-hke:a', 'chat-hke:b', 'chat-hke:c']);
  assert.deepEqual(previewRunRows(rows, 'desktop-hke', projects).map(item => `${item.projectId}:${item.targetId}`),
    ['desktop-hke:a', 'desktop-hke:b', 'desktop-hke:c']);
  assert.deepEqual(previewRunRows(rows, 'missing', projects), []);
});
