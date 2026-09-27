import test from 'node:test';
import assert from 'node:assert/strict';
import { previewTargetMatchesProject, previewTargetRunning } from '../src/preview/targetMatch';

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
});

test('a site is named by the address a developer knows it by', async () => {
  const { previewAddress } = await import('../src/preview/targetMatch');
  assert.equal(previewAddress({ targetId: 'auto-port:5173' }), 'localhost:5173');
  assert.equal(previewAddress({ targetId: 'attached-port:8001' }), 'localhost:8001');
  assert.equal(previewAddress({ targetId: 'managed:web' }), null);
});
