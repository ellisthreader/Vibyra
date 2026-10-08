import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { once } from 'node:events';
import { extractTar, writeTar } from './sync-tar.mjs';

// Agent conversations (docs/cloud-sync-contract.md "Transcripts"). Runs inside the uid-1001 worker, so $HOME is only ever touched as 1001.
export const MAX_SESSIONS = 5, MAX_BYTES = 50 * 1024 * 1024;
const CLAUDE = /^claude\/[A-Za-z0-9_-]{1,80}\.jsonl$/, CODEX = /^codex\/(\d{4}\/\d{2}\/\d{2}\/)?rollout-[A-Za-z0-9._-]{1,200}\.jsonl$/;
export const claudeDirName = cwd => cwd.replace(/[^A-Za-z0-9]/g, '-');
/** Maps a recorded cwd that is the project root (or inside it) from one machine's root to the other's; anything else is left alone. */
export const mapper = (from, to) => c => (c === from ? to : c.startsWith(`${from}/`) ? to + c.slice(from.length) : c);

/** Copies a JSONL file rewriting only top-level `cwd` and `session_meta.payload.cwd`; untouched lines stay byte-identical. */
export async function rewriteCwd(src, dest, map) {
  const out = fs.createWriteStream(dest, { mode: 0o600 }); const rl = readline.createInterface({ input: fs.createReadStream(src), crlfDelay: Infinity });
  for await (const line of rl) {
    let text = line;
    if (line.includes('"cwd"')) {
      try {
        const o = JSON.parse(line); let hit = false;
        if (o && typeof o === 'object' && typeof o.cwd === 'string' && map(o.cwd) !== o.cwd) { o.cwd = map(o.cwd); hit = true; }
        if (o?.type === 'session_meta' && typeof o.payload?.cwd === 'string' && map(o.payload.cwd) !== o.payload.cwd) { o.payload.cwd = map(o.payload.cwd); hit = true; }
        if (hit) text = JSON.stringify(o);
      } catch { /* not JSON: keep the line as it was */ }
    }
    if (!out.write(`${text}\n`)) await once(out, 'drain');
  }
  out.end(); await once(out, 'close');
}
const datePath = (file, mtime) => { const m = /rollout-(\d{4})-(\d{2})-(\d{2})T/.exec(file) ?? null; if (m) return `${m[1]}/${m[2]}/${m[3]}`; const d = new Date(mtime * 1000); return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`; };

/** Places a received transcripts tar under $HOME for this project. Returns the placed session keys and the Mac cwd for the return path. */
export async function applyTranscripts({ home, projectsDir, project, tmp, tarFile }) {
  await fsp.mkdir(tmp, { recursive: true, mode: 0o700 }); const scratch = await fsp.mkdtemp(path.join(tmp, 'tr-')); const root = path.join(projectsDir, project);
  try {
    const names = await extractTar(tarFile, scratch, { accept: n => n === 'manifest.json' || CLAUDE.test(n) || CODEX.test(n) });
    if (!names.includes('manifest.json')) throw Error('transcripts: no manifest');
    const manifest = JSON.parse(await fsp.readFile(path.join(scratch, 'manifest.json'), 'utf8'));
    if (manifest.project !== project || !Array.isArray(manifest.sessions)) throw Error('transcripts: manifest mismatch');
    const placed = {}; let macCwd = null;
    for (const s of manifest.sessions.slice(0, 2 * MAX_SESSIONS)) {
      if (!['claude', 'codex'].includes(s?.provider) || !names.includes(s.file) || !path.isAbsolute(String(s.cwd ?? '')) || !Number.isFinite(s.mtime)) continue;
      const claude = s.provider === 'claude';
      if (!(claude ? CLAUDE : CODEX).test(s.file) || (claude && s.file !== `claude/${s.id}.jsonl`)) continue;
      const dest = claude ? path.join(home, '.claude/projects', claudeDirName(root), path.basename(s.file)) : path.join(home, '.codex/sessions', datePath(s.file, s.mtime), path.basename(s.file));
      macCwd ??= s.cwd;
      const existing = await fsp.stat(dest).catch(() => null);
      if (existing && existing.mtimeMs / 1000 > s.mtime) continue; // a newer copy on the VM wins
      await fsp.mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
      const tmpDest = `${dest}.${process.pid}.part`; await rewriteCwd(path.join(scratch, s.file), tmpDest, mapper(s.cwd, root));
      await fsp.utimes(tmpDest, s.mtime, s.mtime); await fsp.rename(tmpDest, dest); placed[path.relative(home, dest)] = s.mtime * 1000;
    }
    return { placed, macCwd };
  } finally { await fsp.rm(scratch, { recursive: true, force: true }); }
}

async function firstCwd(file) {
  const fh = await fsp.open(file, 'r').catch(() => null); if (!fh) return null;
  try { const b = Buffer.alloc(65536); const { bytesRead } = await fh.read(b, 0, b.length, 0); const line = b.toString('utf8', 0, bytesRead).split('\n')[0];
    const o = JSON.parse(line); return o?.type === 'session_meta' ? o.payload?.cwd ?? null : null; } catch { return null; } finally { await fh.close(); }
}
async function codexFiles(home, root) {
  const base = path.join(home, '.codex/sessions'); const all = [];
  const list = async d => (await fsp.readdir(d, { withFileTypes: true }).catch(() => [])).filter(e => !e.isSymbolicLink());
  for (const y of await list(base)) for (const m of y.isDirectory() ? await list(path.join(base, y.name)) : []) for (const d of m.isDirectory() ? await list(path.join(base, y.name, m.name)) : [])
    for (const f of d.isDirectory() ? await list(path.join(base, y.name, m.name, d.name)) : []) if (f.isFile() && /^rollout-.*\.jsonl$/.test(f.name)) all.push(path.join(base, y.name, m.name, d.name, f.name));
  const stats = (await Promise.all(all.map(async file => ({ file, st: await fsp.stat(file).catch(() => null) })))).filter(x => x.st?.isFile()).sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
  const mine = []; for (const x of stats.slice(0, 300)) { if (mine.length >= MAX_SESSIONS) break; if ((await firstCwd(x.file)) === root) mine.push(x); }
  return mine;
}
/** Collects sessions created or changed on the VM (cwd mapped to the Mac root when known). Returns null when nothing changed, else {tarFile, markSent}. */
export async function collectTranscripts({ home, projectsDir, project, tmp, sent = {}, macCwd = null }) {
  const root = path.join(projectsDir, project); const picked = [];
  const cdir = path.join(home, '.claude/projects', claudeDirName(root));
  const cl = (await Promise.all((await fsp.readdir(cdir).catch(() => [])).filter(n => /^[A-Za-z0-9_-]{1,80}\.jsonl$/.test(n)).map(async n => ({ file: path.join(cdir, n), st: await fsp.lstat(path.join(cdir, n)).catch(() => null), id: n.slice(0, -6) }))))
    .filter(x => x.st?.isFile()).sort((a, b) => b.st.mtimeMs - a.st.mtimeMs).slice(0, MAX_SESSIONS);
  for (const x of cl) picked.push({ provider: 'claude', id: x.id, name: `claude/${x.id}.jsonl`, ...x });
  for (const x of await codexFiles(home, root)) picked.push({ provider: 'codex', id: path.basename(x.file, '.jsonl').slice(-36), name: `codex/${path.basename(x.file)}`, ...x });
  const changed = picked.filter(x => x.st.size <= MAX_BYTES && x.st.mtimeMs > (sent[path.relative(home, x.file)] ?? 0));
  if (!changed.length) return null;
  await fsp.mkdir(tmp, { recursive: true, mode: 0o700 }); const scratch = await fsp.mkdtemp(path.join(tmp, 'tro-'));
  try {
    const map = macCwd ? mapper(root, macCwd) : c => c; const entries = [], files = [];
    for (const [i, x] of changed.entries()) {
      const copy = path.join(scratch, `s${i}`); await rewriteCwd(x.file, copy, map); const st = await fsp.stat(copy);
      files.push({ name: x.name, file: copy, mtime: x.st.mtimeMs / 1000 }); const at = Math.floor(x.st.mtimeMs / 1000);
      entries.push({ provider: x.provider, id: x.id, file: x.name, cwd: macCwd ?? root, mtime: at, ranIn: 'cloud', cloudAt: at, bytes: st.size }); // ranIn/cloudAt: docs/cloud-access-contract.md "Runtime"
    }
    files.push({ name: 'manifest.json', data: Buffer.from(JSON.stringify({ project, sessions: entries.map(({ bytes, ...e }) => e) })), mtime: Date.now() / 1000 });
    const tarFile = path.join(tmp, `tr-out-${process.pid}-${Date.now()}.tar`); await writeTar(tarFile, files);
    return { tarFile, markSent: () => Object.fromEntries(changed.map(x => [path.relative(home, x.file), x.st.mtimeMs])) };
  } finally { await fsp.rm(scratch, { recursive: true, force: true }); }
}
