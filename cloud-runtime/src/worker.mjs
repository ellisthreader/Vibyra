import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { safePath, snapshot, restore, sha, validateNames } from './files.mjs';
import { Commands } from './commands.mjs';
import { preview } from './preview.mjs';
const commands = new Commands(); let root, limits;
if (process.platform === 'linux') await fs.writeFile('/proc/self/oom_score_adj', '500');
async function action(a) {
  const args = a.arguments ?? {};
  switch (a.operation) {
    case 'preview': return preview(args);
    case 'snapshot': return { files: await snapshot(root, limits) };
    case 'cloud_run_command': return commands.run(args.command, root, (a.expiresAt * 1000) - Date.now());
    case 'list_files': {
      const prefix = args.path === '.' || args.path === '' ? '' : args.path;
      if (prefix) await safePath(root, prefix);
      const all = (await snapshot(root, limits)).filter(f => !prefix || f.path.startsWith(prefix.replace(/\/$/, '') + '/'));
      return { files: all.slice(0, 50).map(f => ({ path: f.path, sha256: f.sha256 })), truncated: all.length > 50 };
    }
    case 'read_file': {
      const h = await fs.open(await safePath(root, args.path), constants.O_RDONLY | constants.O_NOFOLLOW);
      try { const stat = await h.stat(); if (!stat.isFile() || stat.size > 8192) throw Error('Read supports text files up to 8 KiB');
        const b = await h.readFile(); return { path: args.path, content: b.toString('utf8'), sha256: sha(b) }; } finally { await h.close(); }
    }
    case 'search_files': {
      if (typeof args.query !== 'string' || !args.query || args.query.length > 200) throw Error('Invalid search');
      const matches = [];
      for (const f of await snapshot(root, limits)) {
        const lines = Buffer.from(f.content, 'base64').toString('utf8').split('\n');
        for (let i = 0; i < lines.length && matches.length < 100; i++) if (lines[i].toLowerCase().includes(args.query.toLowerCase())) matches.push({ path: f.path, line: i + 1, text: lines[i].slice(0, 500) });
      }
      return { matches };
    }
    case 'write_file': {
      const existing = await snapshot(root, limits);
      validateNames([...existing.filter(f => f.path !== args.path), { path: args.path }]);
      const p = await safePath(root, args.path, true); let previous = Buffer.alloc(0);
      try { const h = await fs.open(p, constants.O_RDONLY | constants.O_NOFOLLOW); try { previous = await h.readFile(); } finally { await h.close(); } }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      const expected = args.expectedSha256 === 'new' ? sha(Buffer.alloc(0)) : args.expectedSha256;
      if (args.expectedSha256 === 'new') { try { await fs.lstat(p); throw Error('New file already exists'); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
      if (sha(previous) !== expected || typeof args.content !== 'string' || Buffer.byteLength(args.content) > 8192) throw Error('File changed or edit exceeds quota');
      const scratch = path.join(root, '.cloud-control'); await fs.mkdir(scratch, { recursive: true, mode: 0o700 });
      if ((await fs.lstat(scratch)).isSymbolicLink()) throw Error('Invalid edit staging directory');
      const temporary = path.join(scratch, randomUUID());
      const mode = await fs.stat(p).then(s => s.mode & 0o777).catch(e => { if (e.code === 'ENOENT') return 0o644; throw e; });
      const h = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
      try { await h.writeFile(args.content); await h.sync(); } finally { await h.close(); }
      try {
        const current = await fs.readFile(await safePath(root, args.path)).catch(e => { if (e.code === 'ENOENT') return Buffer.alloc(0); throw e; });
        if (sha(current) !== sha(previous)) throw Error('File changed during edit');
        const target = await safePath(root, args.path);
        if (args.expectedSha256 === 'new') await fs.link(temporary, target);
        else await fs.rename(temporary, target);
      } finally { await fs.unlink(temporary).catch(() => {}); }
      return { path: args.path, sha256: sha(Buffer.from(args.content)) };
    }
    default: throw Error('Unsupported cloud action');
  }
}
process.on('message', async m => {
  try {
    let result;
    if (m.type === 'init') { root = m.root; limits = m.limits; if (m.restore) await restore(root, m.files, limits); result = { ready: true }; }
    else if (m.type === 'kill') { commands.kill(); result = {}; }
    else if (m.type === 'snapshot') result = { files: await snapshot(root, limits) };
    else result = await action(m.action);
    process.send({ id: m.id, result });
  } catch (e) { process.send({ id: m.id, error: e.message }); }
});
