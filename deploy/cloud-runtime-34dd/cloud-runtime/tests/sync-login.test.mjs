import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { vmSetup } from './sync-helpers.mjs';
import { sealBuffer, generateKeyPair } from '../src/sync-crypto.mjs';
import { createSyncEngine } from '../src/sync-loop.mjs';

// Logins made for Cloud (origin 'cloud') are installed; copies of the Mac's own login are dropped (2026-10-07).
// Every secret in this file is an obviously fake fixture string. No real credential file is ever read.
const SECRET = 'FIXTURE-SECRET-TOKEN-do-not-use-0001';
const SECRET2 = 'FIXTURE-SECRET-TOKEN-do-not-use-0002';
const authJson = secret => JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: secret, refresh_token: `${secret}-refresh` } });

/** A ustar archive built by hand so the tests can make hostile ones. entries: [{name, data, type, link}] */
function tar(entries, { end = true } = {}) {
  const out = [];
  for (const e of entries) {
    const data = Buffer.from(e.data ?? ''); const h = Buffer.alloc(512);
    h.write(e.name, 0, 100, 'utf8'); h.write('0000644\0', 100, 'latin1'); h.write('0000000\0', 108, 'latin1'); h.write('0000000\0', 116, 'latin1');
    h.write(`${(e.size ?? data.length).toString(8).padStart(11, '0')}\0`, 124, 'latin1'); h.write('00000000000\0', 136, 'latin1'); h.write('        ', 148, 'latin1');
    h.write(e.type ?? '0', 156, 'latin1'); if (e.link) h.write(e.link, 157, 100, 'latin1'); h.write('ustar\0', 257, 'latin1'); h.write('00', 263, 'latin1');
    h.write(`${[...h].reduce((a, c) => a + c, 0).toString(8).padStart(6, '0')}\0 `, 148, 'latin1');
    out.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  if (end) out.push(Buffer.alloc(1024)); return Buffer.concat(out);
}
const good = (secret = SECRET) => tar([{ name: 'codex/auth.json', data: authJson(secret) }]);
async function queue(vm, id, plain, seq, extra = {}) {
  const body = await sealBuffer(vm.vmKey.publicHex, plain);
  const item = { id, project: null, provider: 'codex', origin: 'cloud', kind: 'login', seq, bytes: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex'), ...extra };
  vm.api.items.push(item); vm.api.blobs.set(id, body); return item;
}
const authFile = vm => path.join(vm.paths.home, '.codex', 'auth.json');
const reportFor = (vm, id) => vm.api.applied.find(a => a.id === id)?.body;
async function setup(t) { const logs = []; const vm = await vmSetup(t, { log: (...a) => logs.push(a.join(' ')) }); return { vm, logs }; }
/** No fixture secret may appear in logs, reports, or any file left in the scratch (tmp) / state / project dirs. */
async function assertNoLeaks(vm, logs) {
  const blob = JSON.stringify([logs, vm.api.applied, vm.api.status, vm.api.seen]);
  for (const s of [SECRET, SECRET2]) assert.ok(!blob.includes(s), 'secret in logs or reports');
  for (const dir of [vm.paths.tmp, vm.paths.syncDir, vm.paths.projects, vm.paths.shadow]) for (const f of await walkAll(dir)) {
    const data = (await fs.readFile(f).catch(() => Buffer.alloc(0))).toString('latin1'); assert.ok(!data.includes('FIXTURE-SECRET'), `plaintext left in ${path.relative(vm.root, f)}`);
  }
  assert.deepEqual(await fs.readdir(vm.paths.tmp), [], 'scratch dir not empty');
}
async function walkAll(dir) { const out = []; for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) { const f = path.join(dir, e.name); if (e.isDirectory()) out.push(...await walkAll(f)); else out.push(f); } return out; }

test('happy path: the login lands in $HOME/.codex/auth.json mode 0600 (dir 0700), the ack is ok, nothing else is left', async t => {
  const { vm, logs } = await setup(t); await queue(vm, 'l1', good(), 1);
  assert.equal(await vm.engine.drain(), 1);
  assert.deepEqual(reportFor(vm, 'l1'), { ok: true });
  assert.equal(await fs.readFile(authFile(vm), 'utf8'), authJson(SECRET));
  assert.equal((await fs.stat(authFile(vm))).mode & 0o777, 0o600); assert.equal((await fs.stat(path.dirname(authFile(vm)))).mode & 0o777, 0o700);
  assert.deepEqual((await fs.readdir(path.dirname(authFile(vm)))).sort(), ['auth.json']); // no temp file left beside it
  assert.equal((await vm.engine.ctx.state.get('_login-codex')).seq, 1);
  await assertNoLeaks(vm, logs); assert.ok(logs.some(l => l.includes('login')), 'engine logged the apply without contents');
});
test('a lost ack is re-delivered: answered ok from the record, the file is not rewritten', async t => {
  const { vm } = await setup(t); await queue(vm, 'l1', good(), 1); await vm.engine.drain();
  await fs.writeFile(authFile(vm), authJson(SECRET2), { mode: 0o600 }); vm.api.applied.length = 0; // the VM refreshed its own token meanwhile
  await vm.engine.drain(); assert.deepEqual(reportFor(vm, 'l1'), { ok: true });
  assert.equal(await fs.readFile(authFile(vm), 'utf8'), authJson(SECRET2));
});
test('an existing different login is replaced only by a higher seq; an identical one is left alone', async t => {
  const { vm, logs } = await setup(t); await fs.mkdir(path.dirname(authFile(vm)), { recursive: true });
  await fs.writeFile(authFile(vm), authJson(SECRET2), { mode: 0o644 }); // already signed in on the VM, never carried before
  await queue(vm, 'a', good(), 5); await vm.engine.drain();
  assert.equal(await fs.readFile(authFile(vm), 'utf8'), authJson(SECRET), 'first carried login is newer than the nothing recorded'); assert.equal((await fs.stat(authFile(vm))).mode & 0o777, 0o600);
  await fs.writeFile(authFile(vm), authJson(SECRET2), { mode: 0o600 }); // the VM signs in again by hand
  await queue(vm, 'old', good(), 3); await vm.engine.drain();
  assert.deepEqual(reportFor(vm, 'old'), { ok: true }); assert.equal(await fs.readFile(authFile(vm), 'utf8'), authJson(SECRET2), 'lower seq never replaces');
  assert.equal((await vm.engine.ctx.state.get('_login-codex')).seq, 5);
  await queue(vm, 'same-seq', good(), 5); await vm.engine.drain(); assert.equal(await fs.readFile(authFile(vm), 'utf8'), authJson(SECRET2), 'equal seq never replaces');
  await queue(vm, 'new', good(), 6); await vm.engine.drain(); assert.equal(await fs.readFile(authFile(vm), 'utf8'), authJson(SECRET), 'higher seq replaces');
  assert.equal((await vm.engine.ctx.state.get('_login-codex')).seq, 6); await assertNoLeaks(vm, logs);
});
test('a planted symlink at auth.json is replaced, never followed; a symlinked .codex is refused', async t => {
  const { vm } = await setup(t); const victim = path.join(vm.root, 'victim'); await fs.writeFile(victim, 'untouched'); await fs.mkdir(path.dirname(authFile(vm)), { recursive: true });
  await fs.symlink(victim, authFile(vm)); await queue(vm, 'l', good(), 1); await vm.engine.drain();
  assert.deepEqual(reportFor(vm, 'l'), { ok: true }); assert.equal(await fs.readFile(victim, 'utf8'), 'untouched'); assert.ok((await fs.lstat(authFile(vm))).isFile());
  const vm2 = (await setup(t)).vm; const elsewhere = path.join(vm2.root, 'elsewhere'); await fs.mkdir(elsewhere); await fs.symlink(elsewhere, path.join(vm2.paths.home, '.codex'));
  await queue(vm2, 'l', good(), 1); await vm2.engine.drain(); assert.equal(reportFor(vm2, 'l').ok, false); assert.deepEqual(await fs.readdir(elsewhere), []);
});
for (const [label, plain, error] of [
  ['an extra entry', tar([{ name: 'codex/auth.json', data: authJson(SECRET) }, { name: 'codex/extra.txt', data: SECRET2 }]), /invalid login archive/],
  ['an extra entry first', tar([{ name: 'codex/extra.txt', data: SECRET2 }, { name: 'codex/auth.json', data: authJson(SECRET) }]), /invalid login archive/],
  ['a path traversal name', tar([{ name: '../codex/auth.json', data: authJson(SECRET) }]), /invalid login archive/],
  ['an absolute name', tar([{ name: '/etc/auth.json', data: authJson(SECRET) }]), /invalid login archive/],
  ['a dotted name', tar([{ name: 'codex/../codex/auth.json', data: authJson(SECRET) }]), /invalid login archive/],
  ['a name with data after NUL', tar([{ name: 'codex/auth.json\0../../hidden', data: authJson(SECRET) }]), /invalid login archive/],
  ['a wrong name', tar([{ name: 'auth.json', data: authJson(SECRET) }]), /invalid login archive/],
  ['a symlink entry', tar([{ name: 'codex/auth.json', type: '2', link: '/etc/passwd', size: 0 }]), /invalid login archive/],
  ['a directory entry', tar([{ name: 'codex/auth.json', type: '5', size: 0 }]), /invalid login archive/],
  ['a pax header', tar([{ name: 'codex/auth.json', type: 'x', data: authJson(SECRET) }]), /invalid login archive/],
  ['an oversize file (64 KiB + 1)', tar([{ name: 'codex/auth.json', data: JSON.stringify({ k: SECRET, pad: 'x'.repeat(65536) }) }]), /invalid login archive/],
  ['JSON that does not parse', tar([{ name: 'codex/auth.json', data: `{"token": "${SECRET}", oops` }]), /invalid login file/],
  ['JSON that is not an object', tar([{ name: 'codex/auth.json', data: `"${SECRET}"` }]), /invalid login file/],
  ['a truncated archive', good().subarray(0, 700), /invalid login archive/],
  ['junk after the end blocks', Buffer.concat([good(), Buffer.from(SECRET2)]), /invalid login archive/],
  ['a corrupt header checksum', (() => { const b = Buffer.from(good()); b[110] ^= 1; return b; })(), /invalid login archive/],
]) test(`refused with no file written: ${label}`, async t => {
  const { vm, logs } = await setup(t); await queue(vm, 'bad', plain, 1); await vm.engine.drain();
  const r = reportFor(vm, 'bad'); assert.equal(r.ok, false); assert.match(r.error, error); assert.deepEqual(Object.keys(r).sort(), ['error', 'ok']);
  assert.equal(await fs.stat(path.join(vm.paths.home, '.codex')).catch(() => null), null, 'nothing created'); assert.equal((await vm.engine.ctx.state.get('_login-codex')).seq, undefined);
  await assertNoLeaks(vm, logs);
});
test('a refused login leaves an existing login untouched', async t => {
  const { vm, logs } = await setup(t); await fs.mkdir(path.dirname(authFile(vm)), { recursive: true }); await fs.writeFile(authFile(vm), authJson(SECRET2), { mode: 0o600 });
  await queue(vm, 'bad', tar([{ name: 'codex/auth.json', data: `{"x": "${SECRET}", nope` }]), 9); await vm.engine.drain();
  assert.equal(reportFor(vm, 'bad').ok, false); assert.equal(await fs.readFile(authFile(vm), 'utf8'), authJson(SECRET2)); await assertNoLeaks(vm, logs);
});
test('transport failures: wrong sha256, tampered ciphertext, sealed for another key, oversize blob', async t => {
  const { vm, logs } = await setup(t);
  await queue(vm, 'sha', good(), 1, { sha256: 'f'.repeat(64) });
  const tampered = Buffer.from(await sealBuffer(vm.vmKey.publicHex, good())); tampered[80] ^= 1;
  vm.api.items.push({ id: 'tamper', project: null, provider: 'codex', origin: 'cloud', kind: 'login', seq: 2, bytes: tampered.length, sha256: crypto.createHash('sha256').update(tampered).digest('hex') }); vm.api.blobs.set('tamper', tampered);
  const other = await sealBuffer(generateKeyPair().public, good());
  vm.api.items.push({ id: 'wrongkey', project: null, provider: 'codex', origin: 'cloud', kind: 'login', seq: 3, bytes: other.length, sha256: crypto.createHash('sha256').update(other).digest('hex') }); vm.api.blobs.set('wrongkey', other);
  await queue(vm, 'big', good(), 4, { bytes: 300000 });
  await vm.engine.drain();
  assert.match(reportFor(vm, 'sha').error, /hash mismatch/); assert.match(reportFor(vm, 'tamper').error, /could not open/); assert.match(reportFor(vm, 'wrongkey').error, /could not open/); assert.match(reportFor(vm, 'big').error, /too large/);
  assert.equal(await fs.stat(path.join(vm.paths.home, '.codex')).catch(() => null), null); await assertNoLeaks(vm, logs);
});
test('unsupported provider or a project-bound login item is refused without downloading it', async t => {
  const { vm } = await setup(t); await queue(vm, 'claude', good(), 1, { provider: 'gemini' }); await queue(vm, 'proj', good(), 2, { project: 'my-app' });
  await vm.engine.drain(); assert.equal(reportFor(vm, 'claude').ok, false); assert.equal(await fs.stat(path.join(vm.paths.home, '.codex')).catch(() => null), null);
  assert.ok(!vm.api.seen.some(s => s.includes('/blobs/claude') && s.startsWith('GET')));
});
test('a restarted worker keeps the recorded seq (it is on disk in the sync state dir)', async t => {
  const { vm } = await setup(t); await queue(vm, 'l1', good(), 1); await vm.engine.drain();
  const fresh = createSyncEngine({ client: vm.client, paths: vm.paths }); await fresh.start();
  await fs.writeFile(authFile(vm), authJson(SECRET2), { mode: 0o600 }); vm.api.applied.length = 0; await fresh.drain();
  assert.equal(await fs.readFile(authFile(vm), 'utf8'), authJson(SECRET2));
});
test('a login carried from the Mac is acknowledged and dropped: never downloaded, never written', async t => {
  const { vm, logs } = await setup(t); await queue(vm, 'l1', good(), 1, { origin: undefined });
  assert.equal(await vm.engine.drain(), 1);
  assert.deepEqual(reportFor(vm, 'l1'), { ok: true });
  assert.equal(await fs.stat(path.join(vm.paths.home, '.codex')).catch(() => null), null, 'nothing written');
  assert.ok(!vm.api.seen.some(s => s.startsWith('GET') && s.includes('/blobs/l1')), 'the sealed copy is never fetched');
  assert.deepEqual(await vm.engine.ctx.state.get('_login-codex'), { seq: 1, dropped: true });
  await assertNoLeaks(vm, logs);
});
test('Cloud’s own sign-in is never replaced by a Mac copy, whatever its seq', async t => {
  const { vm, logs } = await setup(t); await fs.mkdir(path.dirname(authFile(vm)), { recursive: true });
  await fs.writeFile(authFile(vm), authJson(SECRET2), { mode: 0o600 }); // signed in on Cloud itself
  for (const [id, seq] of [['a', 5], ['b', 9], ['c', 3]]) await queue(vm, id, good(), seq, { origin: undefined });
  await vm.engine.drain();
  for (const id of ['a', 'b', 'c']) assert.deepEqual(reportFor(vm, id), { ok: true });
  assert.equal(await fs.readFile(authFile(vm), 'utf8'), authJson(SECRET2));
  // A restart does not treat the dropped items as a copy to remove.
  const fresh = createSyncEngine({ client: vm.client, paths: vm.paths }); await fresh.start();
  assert.equal(await fs.readFile(authFile(vm), 'utf8'), authJson(SECRET2));
  await assertNoLeaks(vm, logs);
});
test('a copy an older image wrote is removed from this disk once at start (a symlink itself, never its target)', async t => {
  const { vm, logs } = await setup(t); await fs.mkdir(path.dirname(authFile(vm)), { recursive: true });
  await fs.writeFile(authFile(vm), authJson(SECRET), { mode: 0o600 });
  await vm.engine.ctx.state.set('_login-codex', { seq: 4 }); // what the older image recorded after writing the copy
  const logs2 = []; const fresh = createSyncEngine({ client: vm.client, paths: vm.paths, log: (...a) => logs2.push(a.join(' ')) }); await fresh.start();
  assert.equal(await fs.lstat(authFile(vm)).catch(() => null), null, 'the copy is gone');
  assert.ok(logs2.some(l => l.includes('removed a Codex login copied from the Mac')));
  assert.equal((await fresh.ctx.state.get('_login-codex')).forgotten, true);
  // Cloud then signs in on its own; later starts leave that alone.
  await fs.writeFile(authFile(vm), authJson(SECRET2), { mode: 0o600 });
  const again = createSyncEngine({ client: vm.client, paths: vm.paths }); await again.start();
  assert.equal(await fs.readFile(authFile(vm), 'utf8'), authJson(SECRET2));
  const vm2 = (await setup(t)).vm; const victim = path.join(vm2.root, 'victim'); await fs.writeFile(victim, 'untouched');
  await fs.mkdir(path.dirname(authFile(vm2)), { recursive: true }); await fs.symlink(victim, authFile(vm2));
  await vm2.engine.ctx.state.set('_login-codex', { seq: 1 });
  const other = createSyncEngine({ client: vm2.client, paths: vm2.paths }); await other.start();
  assert.equal(await fs.readFile(victim, 'utf8'), 'untouched'); assert.equal(await fs.lstat(authFile(vm2)).catch(() => null), null);
  const vm3 = (await setup(t)).vm; const elsewhere = path.join(vm3.root, 'elsewhere'); await fs.mkdir(elsewhere); await fs.writeFile(path.join(elsewhere, 'auth.json'), 'kept');
  await fs.symlink(elsewhere, path.join(vm3.paths.home, '.codex')); await vm3.engine.ctx.state.set('_login-codex', { seq: 1 });
  const third = createSyncEngine({ client: vm3.client, paths: vm3.paths }); await third.start();
  assert.equal(await fs.readFile(path.join(elsewhere, 'auth.json'), 'utf8'), 'kept', 'a symlinked .codex is never followed');
  await assertNoLeaks(vm, logs);
});
test('a disk that never carried a login keeps its sign-in at start', async t => {
  const { vm } = await setup(t); await fs.mkdir(path.dirname(authFile(vm)), { recursive: true });
  await fs.writeFile(authFile(vm), authJson(SECRET2), { mode: 0o600 });
  const fresh = createSyncEngine({ client: vm.client, paths: vm.paths }); await fresh.start();
  assert.equal(await fs.readFile(authFile(vm), 'utf8'), authJson(SECRET2));
});
test('a Claude copy, a project-bound item or a bad seq is refused without downloading it', async t => {
  const { vm } = await setup(t); await queue(vm, 'claude', good(), 1, { provider: 'claude', origin: undefined }); await queue(vm, 'proj', good(), 2, { project: 'my-app', origin: undefined });
  await queue(vm, 'zero', good(), 0, { origin: undefined });
  await vm.engine.drain(); assert.equal(reportFor(vm, 'claude').ok, false); assert.equal(reportFor(vm, 'proj').ok, false); assert.equal(reportFor(vm, 'zero').ok, false);
  assert.equal(await fs.stat(path.join(vm.paths.home, '.codex')).catch(() => null), null);
  assert.ok(!vm.api.seen.some(s => s.includes('/blobs/') && s.startsWith('GET')));
});

// Claude: the long-lived token from `claude setup-token` on the Mac, carried as `claude/oauth-token`.
const TOKEN = 'sk-ant-oat01-FIXTURE-not-a-real-token-0000000000000000000000';
const claudeTar = (token = TOKEN) => tar([{ name: 'claude/oauth-token', data: token }]);
const claudeHome = vm => path.join(vm.paths.home, '.claude');
for (const [label, file, content] of [
  ['malformed settings', '.claude/settings.json', '{"permissions":{"deny":["Bash(curl:*)"]},'],
  ['non-object settings', '.claude/settings.json', '[]'],
  ['oversized settings', '.claude/settings.json', ' '.repeat(4 * 1024 * 1024 + 1)],
  ['malformed onboarding state', '.claude.json', '{"projects":'],
]) test(`Cloud login preserves ${label} and refuses without recording success`, async t => {
  const { vm } = await setup(t); await fs.mkdir(claudeHome(vm), { recursive: true });
  const target = path.join(vm.paths.home, file); await fs.writeFile(target, content);
  await queue(vm, 'c', claudeTar(), 1, { provider: 'claude' }); await vm.engine.drain();
  assert.deepEqual(reportFor(vm, 'c'), { ok: false, error: 'could not write the login' });
  assert.equal(await fs.readFile(target, 'utf8'), content);
  assert.equal((await vm.engine.ctx.state.get('_login-claude')).seq, undefined);
  if (file === '.claude.json') assert.equal(await fs.stat(path.join(claudeHome(vm), 'settings.json')).catch(() => null), null);
});
test('a Claude login made for Cloud lands in settings.json env (0600) and marks first-run done, keeping what was there', async t => {
  const { vm } = await setup(t); await fs.mkdir(claudeHome(vm), { recursive: true });
  await fs.writeFile(path.join(claudeHome(vm), 'settings.json'), JSON.stringify({ model: 'opus', env: { KEEP: '1' } }));
  await fs.writeFile(path.join(vm.paths.home, '.claude.json'), JSON.stringify({ projects: { '/data/projects/x': { hasTrustDialogAccepted: true } } }));
  await queue(vm, 'c1', claudeTar(), 1, { provider: 'claude' }); await vm.engine.drain();
  assert.deepEqual(reportFor(vm, 'c1'), { ok: true });
  const settings = JSON.parse(await fs.readFile(path.join(claudeHome(vm), 'settings.json'), 'utf8'));
  assert.deepEqual(settings, { model: 'opus', env: { KEEP: '1', CLAUDE_CODE_OAUTH_TOKEN: TOKEN } });
  assert.equal((await fs.stat(path.join(claudeHome(vm), 'settings.json'))).mode & 0o777, 0o600);
  const state = JSON.parse(await fs.readFile(path.join(vm.paths.home, '.claude.json'), 'utf8'));
  assert.deepEqual(state, { projects: { '/data/projects/x': { hasTrustDialogAccepted: true } }, hasCompletedOnboarding: true });
  assert.deepEqual(await vm.engine.ctx.state.get('_login-claude'), { seq: 1, cloud: true });
  // A newer Allow replaces the token; nothing about it reaches a log or a report.
  await queue(vm, 'c2', claudeTar(TOKEN.replace('0000', '1111')), 2, { provider: 'claude' }); await vm.engine.drain();
  assert.equal(JSON.parse(await fs.readFile(path.join(claudeHome(vm), 'settings.json'), 'utf8')).env.CLAUDE_CODE_OAUTH_TOKEN, TOKEN.replace('0000', '1111'));
  assert.ok(!JSON.stringify([vm.api.applied, vm.api.status]).includes('FIXTURE-not-a-real'));
});
test('a fresh Cloud disk gets both files; a bad token, wrong entry or symlinked .claude is refused untouched', async t => {
  const { vm } = await setup(t); await queue(vm, 'c', claudeTar(), 1, { provider: 'claude' }); await vm.engine.drain();
  assert.equal(JSON.parse(await fs.readFile(path.join(claudeHome(vm), 'settings.json'), 'utf8')).env.CLAUDE_CODE_OAUTH_TOKEN, TOKEN);
  assert.equal(JSON.parse(await fs.readFile(path.join(vm.paths.home, '.claude.json'), 'utf8')).hasCompletedOnboarding, true);
  for (const [id, body] of [['junk', claudeTar('not a token')], ['name', tar([{ name: 'claude/token', data: TOKEN }])], ['codex', good()]]) {
    const v = (await setup(t)).vm; await queue(v, id, body, 1, { provider: 'claude' }); await v.engine.drain();
    assert.equal(reportFor(v, id).ok, false); assert.equal(await fs.stat(claudeHome(v)).catch(() => null), null);
  }
  const v = (await setup(t)).vm; const elsewhere = path.join(v.root, 'elsewhere'); await fs.mkdir(elsewhere); await fs.symlink(elsewhere, claudeHome(v));
  await queue(v, 's', claudeTar(), 1, { provider: 'claude' }); await v.engine.drain();
  assert.equal(reportFor(v, 's').ok, false); assert.deepEqual(await fs.readdir(elsewhere), []);
});
test('a Codex login made for Cloud survives restarts and is never treated as an old copy', async t => {
  const { vm } = await setup(t); await queue(vm, 'k', good(), 3); await vm.engine.drain();
  assert.equal(await fs.readFile(authFile(vm), 'utf8'), authJson(SECRET));
  const fresh = createSyncEngine({ client: vm.client, paths: vm.paths }); await fresh.start();
  assert.equal(await fs.readFile(authFile(vm), 'utf8'), authJson(SECRET));
  await queue(vm, 'copy', good(SECRET2), 4, { origin: undefined }); await fresh.drain();
  assert.equal(await fs.readFile(authFile(vm), 'utf8'), authJson(SECRET), 'a later copy never replaces it');
});
