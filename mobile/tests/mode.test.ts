import assert from 'node:assert/strict';
import test from 'node:test';
import { canStartWork, computerMode, computerRemembered } from '../src/ui/mode';
import { fixtureWorkspace } from './conversationWorkspaceFixture';
import type { WorkspaceModel } from '../src/ui/types';

const phone: WorkspaceModel = { ...fixtureWorkspace, status: 'offline', host: null, projects: [], sessions: [],
  selectedSessionId: null, conversation: null };

test('a phone with no computer is not the computer mode, and remembers none', () => {
  assert.equal(computerMode(phone), false);
  assert.equal(computerRemembered(phone), false);
});

test('a connected computer is the computer mode', () => {
  assert.equal(computerMode(fixtureWorkspace), true);
});

// A Vibyra Desktop only lets the phone watch. It is still a connected computer:
// its folders are projects like any other, with what it refuses withheld inside.
test('a watch-only computer is connected', () => {
  assert.equal(computerMode({ ...fixtureWorkspace, viewOnly: true }), true);
});

test('the sample workspace is the computer mode, so previewing it shows the real thing', () => {
  assert.equal(computerMode({ ...fixtureWorkspace, demo: true }), true);
});

test('a remembered computer keeps the way back and its projects, but is not connected', () => {
  for (const status of ['offline', 'error', 'connecting', 'pairing'] as const) {
    const dropped = { ...phone, status, host: fixtureWorkspace.host };
    // Still not the computer mode: nothing may be started, opened or changed.
    assert.equal(computerMode(dropped), false, status);
    // But its folders are worth reading, which is the whole point of remembering them.
    assert.equal(computerRemembered(dropped), true, status);
  }
});

// Connecting is not connected: a computer that is still being reached must not
// unlock the workspace early, or the phone offers folders it cannot list yet.
test('reaching a computer for the first time is still the phone mode', () => {
  assert.equal(computerMode({ ...phone, status: 'pairing' }), false);
  assert.equal(computerMode({ ...phone, status: 'connecting' }), false);
});

// A Mac whose typing switch is on starts and closes terminals when asked, so the
// project face offers + Terminal and a session its Stop; a Mac that only watches,
// or one that predates the switch, offers neither. A Host always does.
test('a Mac that will start terminals on request offers them; a watching one does not', () => {
  assert.equal(canStartWork(fixtureWorkspace), true);
  assert.equal(canStartWork({ ...fixtureWorkspace, viewOnly: true }), false);
  assert.equal(canStartWork({ ...fixtureWorkspace, viewOnly: true, canManage: false }), false);
  assert.equal(canStartWork({ ...fixtureWorkspace, viewOnly: true, canManage: true }), true);
});
