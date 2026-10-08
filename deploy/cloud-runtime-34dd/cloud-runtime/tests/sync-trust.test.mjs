import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { trustClaude, trustCodex, trustProject } from '../src/sync-trust.mjs';

async function home(t) { const d = await fs.mkdtemp(path.join(os.tmpdir(), 'vibyra-trust-')); t.after(() => fs.rm(d, { recursive: true, force: true })); return d; }

test('a synced project is trusted for Claude without losing any other setting', async t => {
  const h = await home(t);
  await fs.writeFile(path.join(h, '.claude.json'), JSON.stringify({ theme: 'dark', hasCompletedOnboarding: true, projects: { '/data/projects/a': { allowedTools: ['x'] } } }));
  assert.equal(await trustClaude(h, '/data/projects/a'), true);
  assert.equal(await trustClaude(h, '/data/projects/a'), false, 'idempotent');
  const c = JSON.parse(await fs.readFile(path.join(h, '.claude.json'), 'utf8'));
  assert.deepEqual(c.projects['/data/projects/a'], { allowedTools: ['x'], hasTrustDialogAccepted: true });
  assert.equal(c.theme, 'dark'); assert.equal(c.hasCompletedOnboarding, true);
  assert.equal((await fs.stat(path.join(h, '.claude.json'))).mode & 0o777, 0o600);
});

test('Claude config that is missing, unreadable JSON or a symlink is handled safely', async t => {
  const h = await home(t);
  assert.equal(await trustClaude(h, '/data/projects/b'), true, 'missing file is created');
  await fs.writeFile(path.join(h, '.claude.json'), '{not json');
  assert.equal(await trustClaude(h, '/data/projects/c'), false, 'broken JSON is left alone');
  assert.equal(await fs.readFile(path.join(h, '.claude.json'), 'utf8'), '{not json');
  const h2 = await home(t); const target = path.join(h2, 'elsewhere.json'); await fs.writeFile(target, '{}');
  await fs.symlink(target, path.join(h2, '.claude.json'));
  assert.equal(await trustClaude(h2, '/data/projects/d'), false, 'a symlinked config is never followed');
  assert.equal(await fs.readFile(target, 'utf8'), '{}');
});

test('Codex gets a trusted project section once, appended without touching the rest', async t => {
  const h = await home(t); await fs.mkdir(path.join(h, '.codex'));
  await fs.writeFile(path.join(h, '.codex', 'config.toml'), 'model = "gpt-5"');
  assert.equal(await trustCodex(h, '/data/projects/a'), true);
  assert.equal(await trustCodex(h, '/data/projects/a'), false, 'idempotent');
  assert.equal(await fs.readFile(path.join(h, '.codex', 'config.toml'), 'utf8'), 'model = "gpt-5"\n\n[projects."/data/projects/a"]\ntrust_level = "trusted"\n');
});

test('an owner-set Codex section for the folder is respected; trustProject never throws', async t => {
  const h = await home(t); await fs.mkdir(path.join(h, '.codex'));
  const own = '[projects."/data/projects/a"]\ntrust_level = "untrusted"\n';
  await fs.writeFile(path.join(h, '.codex', 'config.toml'), own);
  assert.equal(await trustCodex(h, '/data/projects/a'), false);
  assert.equal(await fs.readFile(path.join(h, '.codex', 'config.toml'), 'utf8'), own);
  await trustProject(path.join(h, 'missing-home', 'x'), '/data/projects', 'z'); // creates under a fresh home; no throw
});
