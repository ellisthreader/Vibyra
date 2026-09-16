import assert from 'node:assert/strict';
import test from 'node:test';
import { canStartWork, computerHome, computerMode, computerPlaces, computerRemembered } from '../src/ui/mode';
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

// A Vibyra Desktop only lets the phone watch, so a chat typed on the computer home
// could never start: the phone's own chat stays the home, its terminals still shown.
test('a watch-only computer keeps the phone chat as the home', () => {
  const watching = { ...fixtureWorkspace, viewOnly: true };
  assert.equal(computerMode(watching), true);
  assert.deepEqual(computerPlaces(watching), ['computers', 'projects']);
  assert.equal(computerHome(watching), false);
  assert.equal(computerHome(fixtureWorkspace), true);
  assert.equal(computerHome(phone), false);
});

test('the sample workspace is the computer mode, so previewing it shows the real thing', () => {
  assert.equal(computerMode({ ...fixtureWorkspace, demo: true }), true);
});

test('a remembered computer keeps the way back and its projects, but is not connected', () => {
  for (const status of ['offline', 'error', 'connecting', 'pairing'] as const) {
    const dropped = { ...phone, status, host: fixtureWorkspace.host };
    // Still not the computer mode: nothing may be started, opened or changed.
    assert.equal(computerMode(dropped), false, status);
    // But its folders are worth reading, which is the whole point of
    // remembering them. The page refuses every action with a reason.
    assert.deepEqual(computerPlaces(dropped), ['computers', 'projects'], status);
  }
});

// Connecting is not connected: a computer that is still being reached must not
// unlock the workspace early, or the phone offers folders it cannot list yet.
// A phone that has never paired one has nothing to remember either way.
test('reaching a computer for the first time is still the phone mode', () => {
  assert.deepEqual(computerPlaces({ ...phone, status: 'pairing' }), ['computers']);
  assert.deepEqual(computerPlaces({ ...phone, status: 'connecting' }), ['computers']);
});

// A Mac whose typing switch is on starts and closes terminals when asked, so the
// project face offers + Terminal and a session its Stop; a Mac that only watches,
// or one that predates the switch, offers neither. A Host always does.
test('a Mac that will start terminals on request offers them; a watching one does not', () => {
  assert.equal(canStartWork(fixtureWorkspace), true);
  assert.equal(canStartWork({ ...fixtureWorkspace, viewOnly: true }), false);
  assert.equal(canStartWork({ ...fixtureWorkspace, viewOnly: true, canManage: false }), false);
  assert.equal(canStartWork({ ...fixtureWorkspace, viewOnly: true, canManage: true }), true);
  // The phone chat stays the home either way; the Mac's terminals are one tap away.
  assert.equal(computerHome({ ...fixtureWorkspace, viewOnly: true, canManage: true }), false);
});
