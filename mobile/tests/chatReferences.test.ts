import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chatReferences, missingQuotedReferences } from '../src/integrations/chatReferences';
import { fallbackIntegrations } from '../src/integrations/catalogue';
import type { WorkspaceModel } from '../src/ui/types';
import type { VibesChat } from '../src/vibes/types';

const installed = fallbackIntegrations.map(app => ({ ...app, installed: true }));
const workspace = { status: 'connected', vibesToolsAvailable: true, viewOnly: false,
  host: { id: 'mac' }, railway: { status: 'ready', account: 'test' },
  projects: [{ id: 'vault', name: 'Notes', path: '/notes', kind: 'vault' },
    { id: 'rail', name: 'Railway', path: '/virtual', kind: 'railway' }],
} as WorkspaceModel;
const bound = (project: string, host = 'mac') => ({ host_id: host, project_id: project, binding: 'grant' }) as VibesChat;

test('all five services are suggested, only server connectors enter the quote', () => {
  const refs = chatReferences('@github @stripe @figma @obsidian', installed, workspace, bound('vault'));
  assert.deepEqual(refs.available.map(app => app.id), ['github', 'stripe', 'figma', 'obsidian', 'railway']);
  assert.deepEqual(refs.connectors, ['github', 'stripe', 'figma']);
  assert.equal(refs.issue, null); assert.equal(refs.project, null);
});
test('each device reference needs the exact current host/project binding', () => {
  for (const [id, project] of [['obsidian', 'vault'], ['railway', 'rail']]) {
    assert.equal(chatReferences('@' + id, installed, workspace).project?.id, project);
    assert.equal(chatReferences('@' + id, installed, workspace, bound(project, 'other-mac')).project?.id, project);
    assert.equal(chatReferences('@' + id, installed, workspace, bound(project)).project, null);
  }
});
test('mixed local projects and disconnected accounts never silently fall back to ordinary chat', () => {
  assert.match(chatReferences('@obsidian @railway', installed, workspace).issue!, /separate messages/);
  assert.match(chatReferences('@figma', [], workspace).issue!, /Connect Figma/);
  assert.match(chatReferences('@obsidian', installed, { ...workspace, status: 'offline' }).issue!, /Connect Obsidian/);
  assert.match(chatReferences('@railway', installed, { ...workspace, vibesToolsAvailable: false }).issue!, /Connect Railway/);
  assert.match(chatReferences('@obsidian', installed, { ...workspace, viewOnly: true }).issue!, /Connect Obsidian/);
});
test('teammate permissions are never expanded by a mention', () => {
  const refs = chatReferences('@figma @railway', installed, workspace, undefined, ['github']);
  assert.deepEqual(refs.available.map(app => app.id), ['github']);
  assert.deepEqual(refs.connectors, []); assert.match(refs.issue!, /not enabled/);
});
test('server removal of requested tools is visible before send', () => {
  assert.equal(missingQuotedReferences(['figma', 'github'], ['github']), true);
  assert.equal(missingQuotedReferences(['figma'], ['figma']), false);
  assert.equal(missingQuotedReferences(['figma'], undefined), false);
});
