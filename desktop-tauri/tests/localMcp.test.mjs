import assert from 'node:assert/strict';
import test from 'node:test';
import { PRESETS, commandLine, emptySpec, envFromRows, missingFields, rowsFromEnv, stateLine } from '../src/lib/localMcp.ts';

const fill = { folder: '/Users/you/My Project', file: '/Users/you/data.db' };

test('the five starters are the plan\'s list and every launcher is pinned to an exact version', () => {
  assert.deepEqual(PRESETS.map(p => p.id), ['filesystem', 'git', 'fetch', 'memory', 'sqlite']);
  for (const p of PRESETS) {
    const spec = p.build(fill);
    assert.ok(['npx', 'uvx'].includes(spec.command), p.id);
    const pkg = spec.args.find(a => /^@?[a-z][\w./-]*(@|==)\d/.test(a));
    assert.ok(pkg && !/latest|\^|~|\*/.test(pkg), `${p.id} is pinned: ${spec.args}`);
  }
});

test('a starter needs its folder or file before it can be added, and scopes the server to it', () => {
  const files = PRESETS.find(p => p.id === 'filesystem');
  assert.deepEqual(missingFields(files, {}), ['Folder']);
  assert.deepEqual(missingFields(files, fill), []);
  assert.equal(files.build(fill).cwd, fill.folder);
  assert.equal(files.build(fill).args.at(-1), fill.folder);
  assert.deepEqual(missingFields(PRESETS.find(p => p.id === 'fetch'), {}), []);
  assert.equal(PRESETS.find(p => p.id === 'memory').build(fill).env.MEMORY_FILE_PATH, fill.file);
});

test('the command is shown exactly as it runs, quoted where a word has a space', () => {
  assert.equal(commandLine({ command: 'npx', args: ['-y', 'pkg@1.2.3', '/Users/you/My Project'] }), 'npx -y pkg@1.2.3 "/Users/you/My Project"');
  assert.equal(commandLine({ command: 'uvx', args: ['--with', 'mcp<2', 'x==1'] }), 'uvx --with "mcp<2" x==1');
});

test('variable rows split into plain values and secret NAMES; blank names are dropped', () => {
  const parts = envFromRows([{ name: 'A', value: '1', secret: false }, { name: 'TOKEN', value: 'hunter2', secret: true }, { name: ' ', value: 'x', secret: false }]);
  assert.deepEqual(parts, { env: { A: '1' }, secretEnv: ['TOKEN'] });
  assert.equal(JSON.stringify(parts).includes('hunter2'), false, 'a secret value never enters the definition');
  assert.deepEqual(rowsFromEnv({ env: { A: '1' }, secretEnv: ['TOKEN'] }), [{ name: 'A', value: '1', secret: false }, { name: 'TOKEN', value: '', secret: true }]);
});

test('status words', () => {
  const view = (state, enabled = true) => ({ spec: { ...emptySpec(), enabled }, status: { state }, unpinned: false, secretsSaved: [] });
  assert.equal(stateLine(view('running')), 'Running');
  assert.equal(stateLine(view('stopped')), 'Starts when a teammate needs it');
  assert.equal(stateLine(view('failed')), 'Stopped after repeated errors');
  assert.equal(stateLine(view('running', false)), 'Switched off');
});
