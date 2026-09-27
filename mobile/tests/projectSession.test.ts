import test from 'node:test';
import assert from 'node:assert/strict';
import { projectSession } from '../src/ui/projectSession';
import { fixtureSession } from './conversationWorkspaceFixture';

const sessions = [
  { ...fixtureSession, id: 'site-terminal', projectId: 'site' },
  { ...fixtureSession, id: 'other-terminal', projectId: 'other' },
];

test('navigation never borrows the previous project’s terminal or Preview scope', () => {
  assert.equal(projectSession(sessions, 'empty', null, 'site-terminal'), undefined);
  assert.equal(projectSession(sessions, 'other', 'site-terminal', 'site-terminal'), undefined);
  assert.equal(projectSession(sessions, 'ideas', null, 'site-terminal'), undefined);
  assert.equal(projectSession(sessions, 'other', 'other-terminal', 'site-terminal'), sessions[1]);
  assert.equal(projectSession(sessions, 'site', null, 'site-terminal'), sessions[0]);
});
