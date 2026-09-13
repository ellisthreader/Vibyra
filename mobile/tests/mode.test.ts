import assert from 'node:assert/strict';
import test from 'node:test';
import { computerMode, computerPlaces, computerRemembered } from '../src/ui/mode';
import { fixtureWorkspace } from './conversationWorkspaceFixture';
import type { WorkspaceModel } from '../src/ui/types';

const phone: WorkspaceModel = { ...fixtureWorkspace, status: 'offline', host: null, projects: [], sessions: [],
  selectedSessionId: null, conversation: null };

test('a phone with no computer is offered Remote alone, never projects', () => {
  assert.equal(computerMode(phone), false);
  assert.equal(computerRemembered(phone), false);
  assert.deepEqual(computerPlaces(phone), ['computers']);
});

test('a connected computer opens its projects and its terminals', () => {
  assert.equal(computerMode(fixtureWorkspace), true);
  assert.deepEqual(computerPlaces(fixtureWorkspace), ['computers', 'projects']);
});

test('the sample workspace is the computer mode, so previewing it shows the real thing', () => {
  assert.equal(computerMode({ ...fixtureWorkspace, demo: true }), true);
});

test('a remembered computer keeps only the way back, never its projects', () => {
  for (const status of ['offline', 'error', 'connecting', 'pairing'] as const) {
    const dropped = { ...phone, status, host: fixtureWorkspace.host };
    assert.equal(computerMode(dropped), false, status);
    assert.deepEqual(computerPlaces(dropped), ['computers'], status);
  }
});

// Connecting is not connected: a computer that is still being reached must not
// unlock the workspace early, or the phone offers folders it cannot list yet.
test('reaching a computer for the first time is still the phone mode', () => {
  assert.deepEqual(computerPlaces({ ...phone, status: 'pairing' }), ['computers']);
  assert.deepEqual(computerPlaces({ ...phone, status: 'connecting' }), ['computers']);
});
