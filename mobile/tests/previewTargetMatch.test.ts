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
