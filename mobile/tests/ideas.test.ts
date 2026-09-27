import assert from 'node:assert/strict';
import test from 'node:test';
import { chatProjectId, chatsInProject, chatWords, IDEAS_PROJECT_ID, isIdeas, knownProjects } from '../src/ui/ideas';
import { fixtureWorkspace } from './conversationWorkspaceFixture';
import type { VibesChat } from '../src/vibes/types';

const chat = (id: string, binding?: { host: string; project: string }): VibesChat => ({ id, title: id, trial_slot: null, trial_used: 0,
  host_id: binding?.host ?? null, project_id: binding?.project ?? null, binding: binding ? 'token' : null });
const host = fixtureWorkspace.host!.id;
const folder = fixtureWorkspace.projects[0]!.id;
const loose = chat('loose');
const bound = chat('bound', { host, project: folder });
const elsewhere = chat('elsewhere', { host: 'another-mac', project: folder });
const gone = chat('gone', { host, project: 'no-such-folder' });

// Every chat lives in a project. One with no folder lives in Ideas; one bound to a
// folder this computer shares lives there; nothing is ever left without a home.
test('a loose chat lives in Ideas and a bound one in its folder', () => {
  assert.equal(chatProjectId(loose, fixtureWorkspace), IDEAS_PROJECT_ID);
  assert.equal(chatProjectId(bound, fixtureWorkspace), folder);
});

test('a chat bound to another computer, or to a folder nobody lists, falls back to Ideas', () => {
  assert.equal(chatProjectId(elsewhere, fixtureWorkspace), IDEAS_PROJECT_ID);
  assert.equal(chatProjectId(gone, fixtureWorkspace), IDEAS_PROJECT_ID);
});

// The computer away: its remembered folders still claim their chats, so the list
// does not shuffle every time the connection drops; a phone that never paired one
// keeps everything in Ideas.
test('a remembered folder keeps its chats while the computer is away', () => {
  const away = { ...fixtureWorkspace, status: 'offline' as const, projects: [],
    remembered: { projects: fixtureWorkspace.projects, seenAt: '2026-09-19T09:00:00Z' } };
  assert.deepEqual(knownProjects(away).map(project => project.id), fixtureWorkspace.projects.map(project => project.id));
  assert.equal(chatProjectId(bound, away), folder);
  const never = { ...fixtureWorkspace, status: 'offline' as const, host: null, projects: [], remembered: null };
  assert.deepEqual(knownProjects(never), []);
  assert.equal(chatProjectId(bound, never), IDEAS_PROJECT_ID);
});

test('a project lists its own chats in the order the store keeps them', () => {
  const chats = [gone, bound, loose, elsewhere];
  assert.deepEqual(chatsInProject(chats, IDEAS_PROJECT_ID, fixtureWorkspace).map(c => c.id), ['gone', 'loose', 'elsewhere']);
  assert.deepEqual(chatsInProject(chats, folder, fixtureWorkspace).map(c => c.id), ['bound']);
});

test('Ideas is known by its id, and counts its chats in words', () => {
  assert.equal(isIdeas(IDEAS_PROJECT_ID), true);
  assert.equal(isIdeas({ id: folder }), false);
  assert.equal(isIdeas(null), false);
  assert.equal(chatWords(0), 'No chats yet');
  assert.equal(chatWords(1), '1 chat');
  assert.equal(chatWords(3), '3 chats');
});
