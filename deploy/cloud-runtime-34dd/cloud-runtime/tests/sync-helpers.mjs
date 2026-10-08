import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { sealBuffer, generateKeyPair } from '../src/sync-crypto.mjs';
import { SyncClient } from '../src/sync-client.mjs';
import { createSyncEngine } from '../src/sync-loop.mjs';
import { writeTar } from '../src/sync-tar.mjs';

export const TOKEN = 'rt-token-xyz';
export async function tmp(t) { const d = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'vibyra-sy-'))); t.after(() => fs.rm(d, { recursive: true, force: true })); return d; }
export const gitEnv = { PATH: process.env.PATH, HOME: os.tmpdir(), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'mac', GIT_AUTHOR_EMAIL: 'm@e', GIT_COMMITTER_NAME: 'mac', GIT_COMMITTER_EMAIL: 'm@e' };
export const g = (cwd, ...args) => execFileSync('git', args, { cwd, env: gitEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export const write = async (root, files) => { for (const [rel, body] of Object.entries(files)) { const f = path.join(root, rel); await fs.mkdir(path.dirname(f), { recursive: true });
  if (body === null) await fs.rm(f, { force: true }); else if (typeof body === 'object' && body.link) await fs.symlink(body.link, f); else if (typeof body === 'object') await fs.writeFile(f, body.data, { mode: body.mode }); else await fs.writeFile(f, body); } };
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** A fake runtime API: the contract's /sync endpoints over real HTTP, recording every call. */
export async function fakeApi(t, { macs = [] } = {}) {
  const s = { macs, items: [], removed: [], resync: [], blobs: new Map(), applied: [], status: [], reports: [], keys: [], uploads: [], projects: [], seen: [], badToken: 0 };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x'); const prefix = '/api/cloud-runtime/ws/sync'; s.seen.push(`${req.method} ${url.pathname}`);
    if (req.headers.authorization !== `Bearer ${TOKEN}`) { s.badToken++; res.writeHead(401).end('{}'); return; }
    const chunks = []; for await (const c of req) chunks.push(c); const body = Buffer.concat(chunks);
    const json = (o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); }; const p = url.pathname.slice(prefix.length);
    if (!url.pathname.startsWith(prefix)) return json({ ok: false }, 404);
    if (p === '/key') { s.keys.push(JSON.parse(body).publicKey); return json({ ok: true }); }
    if (p === '/macs') return json({ ok: true, macs: s.macs.map(m => ({ id: m.id, publicKey: m.publicKey })) });
    if (p === '/pending') return json({ ok: true, items: s.items.filter(i => !s.applied.some(a => a.id === i.id && (a.body.ok || a.body.needFull))), removed: s.removed, resync: s.resync });
    if (p === '/state') return json({ ok: true, projects: s.projects });
    if (p === '/status') { const r = JSON.parse(body); s.status.push(r.applying); s.reports.push(r); return json({ ok: true }); }
    let m;
    if ((m = /^\/blobs\/([^/]+)\/applied$/.exec(p))) { s.applied.push({ id: m[1], body: JSON.parse(body) }); return json({ ok: true }); }
    if ((m = /^\/blobs\/([^/]+)$/.exec(p)) && req.method === 'GET') { const b = s.blobs.get(m[1]); if (!b) return json({ ok: false }, 404); res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': b.length }); return res.end(b); }
    if ((m = /^\/projects\/([^/]+)\/down$/.exec(p)) && req.method === 'PUT') {
      const params = Object.fromEntries(url.searchParams); const ok = crypto.createHash('sha256').update(body).digest('hex') === params.sha256;
      if (!ok) return json({ ok: false, code: 'sha_mismatch' }, 422);
      s.uploads.push({ project: m[1], ...params, seq: Number(params.seq), baseSeq: Number(params.baseSeq), body, length: req.headers['content-length'] });
      const pr = s.projects.find(x => x.name === m[1]); if (pr) { if (params.kind === 'code') pr.downSeq = Number(params.seq); else pr.transcriptsDownSeq = Number(params.seq); }
      return json({ ok: true });
    }
    json({ ok: false }, 404);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => { server.closeAllConnections?.(); server.close(r); }));
  s.url = `http://127.0.0.1:${server.address().port}`; return s;
}

/** A VM data dir plus engine wired to the fake API. The Mac pair is registered in the API; the VM key is written like ensureKey would. */
export async function vmSetup(t, opts = {}) {
  const root = await tmp(t); const mac = generateKeyPair();
  const api = await fakeApi(t, { macs: [{ id: 'mac-1', publicKey: mac.public.toString('hex') }] });
  const paths = { home: path.join(root, 'home'), projects: path.join(root, 'projects'), shadow: path.join(root, 'shadow'), tmp: path.join(root, 'tmp'), syncDir: path.join(root, 'sync') };
  for (const d of Object.values(paths)) await fs.mkdir(d, { recursive: true });
  const client = new SyncClient(api.url, 'ws', TOKEN); const engine = createSyncEngine({ client, paths, ...opts });
  await engine.start(); const vmKey = engine.ctx.key;
  return { root, mac, api, paths, client, engine, vmKey, wt: n => path.join(paths.projects, n), listing: async n => (await walk(path.join(paths.projects, n))).sort() };
}
export async function walk(dir, base = dir) { const out = []; for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) { const f = path.join(dir, e.name);
  if (e.isDirectory()) out.push(...await walk(f, base)); else out.push(path.relative(base, f)); } return out; }

/** The Mac side: a working repo whose full-tree snapshot commits form the `refs/vibyra/snap` chain, sealed for the VM. */
export async function macRepo(t, name = 'proj') {
  const dir = await tmp(t); const work = path.join(dir, 'work'); await fs.mkdir(work); g(work, 'init', '-q', '-b', 'main'); let prev = null, seq = 0, tag = 0; const sealed = [];
  return { work, sealed, async snapshot(vmPublic, files, { full = false } = {}) {
    await write(work, files); g(work, 'add', '-A'); const tree = g(work, 'write-tree'); const commit = g(work, 'commit-tree', tree, ...(prev && !full ? ['-p', prev] : []), '-m', `snap ${++tag}`);
    g(work, 'update-ref', 'refs/vibyra/snap', commit); const out = path.join(dir, `b${tag}.bundle`);
    g(work, 'bundle', 'create', out, 'refs/vibyra/snap', ...(prev && !full ? [`^${prev}`] : []));
    const body = await sealBuffer(vmPublic, await fs.readFile(out)); const item = { id: `${name}-${++seq}`, project: name, kind: 'code', seq, baseSeq: prev && !full ? seq - 1 : 0, head: commit, bytes: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex') };
    prev = commit; sealed.push({ item, body }); return { item, body, commit };
  } };
}
export const enqueue = (api, ...entries) => { for (const e of entries) { api.items.push(e.item); api.blobs.set(e.item.id, e.body); } };
export async function transcriptsBlob(vmPublic, id, manifest, files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibyra-trb-')); const tar = path.join(dir, 't.tar');
  await writeTar(tar, [...files.map(f => ({ name: f.name, data: Buffer.from(f.data), mtime: f.mtime })), { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest)) }]);
  const body = await sealBuffer(vmPublic, await fs.readFile(tar)); await fs.rm(dir, { recursive: true, force: true });
  return { item: { id, project: manifest.project, kind: 'transcripts', seq: 1, baseSeq: 0, head: '-', bytes: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex') }, body };
}
