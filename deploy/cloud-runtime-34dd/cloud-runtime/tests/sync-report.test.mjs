import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { vmSetup, macRepo, enqueue } from './sync-helpers.mjs';
import { generateKeyPair } from '../src/sync-crypto.mjs';
import { DOWNLOAD_TRIES } from '../src/sync-apply.mjs';
import { RETRY_MS } from '../src/sync-loop.mjs';

// What the cloud computer tells the backend (and so the phone): `status` = {applying, keyOk, lastError} with a fixed code and a
// plain sentence, sent at the edges of real work or when it changed; never silence, never a raw error string.
const lastApplied = api => api.applied.at(-1).body;
const lastReport = api => api.reports.at(-1);

test('status carries keyOk and clears lastError after a clean pass; an idle pass sends nothing', async t => {
  const vm = await vmSetup(t); const mac = await macRepo(t);
  assert.deepEqual(vm.api.reports, [{ applying: false, keyOk: true, lastError: null }]);
  enqueue(vm.api, await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': '1' })); await vm.engine.drain();
  assert.deepEqual(vm.api.reports.slice(1), [{ applying: true, keyOk: true, lastError: null }, { applying: false, keyOk: true, lastError: null }]);
  const n = vm.api.reports.length; assert.equal(await vm.engine.drain(), 0); assert.equal(vm.api.reports.length, n);
});

test('an upload sealed for another key reports key_mismatch with needFull, and lastError names the project', async t => {
  const vm = await vmSetup(t); const mac = await macRepo(t); const old = generateKeyPair();
  enqueue(vm.api, await mac.snapshot(old.public.toString('hex'), { 'a.txt': '1' })); await vm.engine.drain();
  const body = lastApplied(vm.api);
  assert.deepEqual([body.ok, body.code, body.error, body.needFull], [false, 'key_mismatch', 'key_mismatch', true]);
  assert.deepEqual(lastReport(vm.api), { applying: false, keyOk: true, lastError: { code: 'key_mismatch', message: body.message, project: 'proj' } });
  assert.deepEqual(await vm.listing('proj'), []);
});

test('a download that fails on the network stays pending, is retried later, and after the last try asks for a full upload', async t => {
  let clock = 1_000_000; const vm = await vmSetup(t, { now: () => clock }); const mac = await macRepo(t);
  const s1 = await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': '1' }); vm.api.items.push(s1.item); // no blob stored: the download answers 404
  assert.equal(await vm.engine.drain(), 1); assert.equal(vm.api.applied.length, 0, 'nothing reported for a first failure');
  assert.equal(lastReport(vm.api).lastError.code, 'download_failed');
  const n = vm.api.reports.length; assert.equal(await vm.engine.drain(), 0, 'not retried before its time'); assert.equal(vm.api.reports.length, n);
  for (let i = 1; i < DOWNLOAD_TRIES; i++) { clock += RETRY_MS * i + 1; await vm.engine.drain(); }
  assert.deepEqual([lastApplied(vm.api).code, lastApplied(vm.api).needFull], ['download_failed', true]);
  // Once the blob can be fetched, the full upload the Mac sends next applies and clears the error.
  const full = await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': '2' }, { full: true }); enqueue(vm.api, full); await vm.engine.drain();
  assert.equal(lastApplied(vm.api).state, 'synced'); assert.equal(lastReport(vm.api).lastError, null);
});

test('a blob too big for the free space is refused as disk_full before anything is downloaded', async t => {
  const vm = await vmSetup(t); const mac = await macRepo(t);
  const s1 = await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': '1' }); s1.item.bytes = 2 ** 50; enqueue(vm.api, s1);
  await vm.engine.drain();
  assert.deepEqual([lastApplied(vm.api).ok, lastApplied(vm.api).code], [false, 'disk_full']);
  assert.ok(!vm.api.seen.some(s => s.startsWith('GET') && s.includes('/blobs/')), 'never downloaded');
  assert.deepEqual(await fs.readdir(vm.paths.tmp), []);
});

test('settle lets the item in hand finish and starts no new one', async t => {
  const vm = await vmSetup(t); const mac = await macRepo(t); const macB = await macRepo(t, 'other');
  enqueue(vm.api, await mac.snapshot(vm.vmKey.publicHex, { 'a.txt': '1' }), await macB.snapshot(vm.vmKey.publicHex, { 'b.txt': '1' }));
  const orig = vm.client.applied.bind(vm.client); let settled = null;
  vm.client.applied = async (id, body) => { const r = await orig(id, body); settled ??= vm.engine.settle(5000); return r; };
  await vm.engine.drain(); await settled;
  assert.equal(vm.api.applied.length, 1, 'the second item is left pending for the next boot');
  assert.equal(await fs.readFile(path.join(vm.wt('proj'), 'a.txt'), 'utf8'), '1'); assert.equal(lastReport(vm.api).applying, false);
});
