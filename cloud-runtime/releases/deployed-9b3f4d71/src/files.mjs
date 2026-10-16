import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const excluded = /^(\.git|\.env(?:\..*)?|\.ssh|\.aws|\.vibyra-agent|node_modules|vendor|\.expo|\.DS_Store|\.cloud-control|\.npmrc|\.netrc|\.pypirc)$/i;
export function components(name) {
  if (typeof name !== 'string' || !name || name.length > 1024 || /[\\\x00-\x1f\x7f]/.test(name) || name.startsWith('/')) throw Error('Invalid project path');
  const parts = name.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || excluded.test(p))) throw Error('Excluded project path');
  return parts;
}
export function validateNames(files) {
  const prefixes = new Map(), names = new Set();
  for (const f of files) {
    const parts = components(f.path); const key = f.path.toLowerCase();
    if (names.has(key)) throw Error('Case collision'); names.add(key);
    for (let i = 1; i <= parts.length; i++) {
      const original = parts.slice(0, i).join('/'), folded = original.toLowerCase();
      if (prefixes.has(folded) && prefixes.get(folded) !== original) throw Error('Directory case collision');
      prefixes.set(folded, original);
    }
  }
  for (const name of names) { const parts = name.split('/'); for (let i = 1; i < parts.length; i++) if (names.has(parts.slice(0, i).join('/'))) throw Error('File/directory collision'); }
}
export async function safePath(root, name, create = false) {
  const parts = components(name); let at = root;
  for (let i = 0; i < parts.length; i++) {
    at = path.join(at, parts[i]); let s;
    try { s = await fs.lstat(at); } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      if (i < parts.length - 1 && create) { await fs.mkdir(at); s = await fs.lstat(at); }
      else if (i < parts.length - 1) throw Error('Parent directory missing');
    }
    if (s?.isSymbolicLink() || (i < parts.length - 1 && s && !s.isDirectory())) throw Error('Symlinks are not supported');
  }
  return at;
}
export async function restore(root, files, limits) {
  await fs.mkdir(root, { recursive: true }); let total = 0; const names = new Set();
  if (!Array.isArray(files) || files.length > limits.files) throw Error('File quota exceeded');
  validateNames(files);
  for (const f of files) {
    components(f.path); const folded = f.path.toLowerCase();
    if (names.has(folded)) throw Error('Case collision'); names.add(folded);
    const b = Buffer.from(f.content, 'base64'); total += b.length;
    if (b.toString('base64') !== f.content || sha(b) !== f.sha256 || b.length > limits.fileBytes || total > limits.projectBytes) throw Error('Invalid artifact or quota');
    await fs.writeFile(await safePath(root, f.path, true), b, { flag: 'wx', mode: f.executable ? 0o755 : 0o644 });
  }
}
export async function snapshot(root, limits) {
  const files = []; let bytes = 0;
  async function walk(dir, prefix = '') {
    for (const item of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (excluded.test(item.name)) continue;
      const relative = prefix + item.name; components(relative);
      if (item.isSymbolicLink()) throw Error('Remove symlinks before saving this cloud project');
      if (item.isDirectory()) { await walk(path.join(dir, item.name), relative + '/'); continue; }
      if (!item.isFile()) throw Error('Special files are not supported');
      const handle = await fs.open(await safePath(root, relative), constants.O_RDONLY | constants.O_NOFOLLOW);
      let b, stat; try { stat = await handle.stat(); if (!stat.isFile() || stat.size > limits.fileBytes) throw Error('File quota exceeded'); b = await handle.readFile(); }
      finally { await handle.close(); }
      bytes += b.length;
      if (files.length >= limits.files || bytes > limits.projectBytes) throw Error('Project quota exceeded');
      files.push({ path: relative, content: b.toString('base64'), sha256: sha(b), executable: !!(stat.mode & 0o111) });
    }
  }
  await walk(root); validateNames(files); return files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}
