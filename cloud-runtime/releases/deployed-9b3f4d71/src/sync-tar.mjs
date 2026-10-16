import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

// Minimal ustar reader/writer for the transcripts artifact: regular files only, no compression.
const BLOCK = 512;
const octal = (buf, off, len) => parseInt(buf.toString('latin1', off, off + len).replace(/\0.*$/s, '').trim() || '0', 8);
const pad = n => (BLOCK - (n % BLOCK)) % BLOCK;

/** Extracts regular files from a tar file into `destDir`, keeping only names `accept(name)` allows. Returns the names written. */
export async function extractTar(tarFile, destDir, { accept = () => true, maxFile = 50 * 1024 * 1024, maxEntries = 64 } = {}) {
  const fh = await fsp.open(tarFile, 'r'); const written = []; let pos = 0, entries = 0; const head = Buffer.alloc(BLOCK);
  try {
    for (;;) {
      const { bytesRead } = await fh.read(head, 0, BLOCK, pos); pos += BLOCK;
      if (bytesRead < BLOCK || head.every(b => b === 0)) break;
      const size = octal(head, 124, 12), type = String.fromCharCode(head[156] || 48);
      let name = head.toString('utf8', 0, 100).replace(/\0.*$/s, ''); const prefix = head.toString('utf8', 345, 500).replace(/\0.*$/s, ''); if (prefix) name = `${prefix}/${name}`;
      if (++entries > maxEntries) throw Error('tar: too many entries');
      const keep = type === '0' && size <= maxFile && accept(name) && !name.split('/').some(c => c === '' || c === '.' || c === '..') && !path.isAbsolute(name);
      if (keep) {
        const dest = path.join(destDir, name); await fsp.mkdir(path.dirname(dest), { recursive: true });
        await pipeline(fs.createReadStream(tarFile, { start: pos, end: pos + size - 1 }), fs.createWriteStream(dest, { mode: 0o600 })).catch(e => { if (size) throw e; });
        if (!size) await fsp.writeFile(dest, '', { mode: 0o600 });
        written.push(name);
      }
      pos += size + pad(size);
    }
  } finally { await fh.close(); }
  return written;
}

function header(name, size, mtime) {
  const b = Buffer.alloc(BLOCK); let n = name, prefix = '';
  if (Buffer.byteLength(n) > 100) { const i = n.lastIndexOf('/', n.length - 1); if (i < 0 || i > 155 || Buffer.byteLength(n.slice(i + 1)) > 100) throw Error('tar: name too long'); prefix = n.slice(0, i); n = n.slice(i + 1); }
  b.write(n, 0, 100, 'utf8'); b.write('0000644\0', 100, 'latin1'); b.write('0000000\0', 108, 'latin1'); b.write('0000000\0', 116, 'latin1');
  b.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 'latin1'); b.write(`${Math.floor(mtime).toString(8).padStart(11, '0')}\0`, 136, 'latin1');
  b.write('        ', 148, 'latin1'); b.write('0', 156, 'latin1'); b.write('ustar\0', 257, 'latin1'); b.write('00', 263, 'latin1'); if (prefix) b.write(prefix, 345, 155, 'utf8');
  b.write(`${[...b].reduce((a, c) => a + c, 0).toString(8).padStart(6, '0')}\0 `, 148, 'latin1'); return b;
}
/** Writes `files` ([{name, file, mtime}] or {name, data: Buffer}) as a ustar archive to `outFile`. */
export async function writeTar(outFile, files) {
  const out = await fsp.open(outFile, 'w', 0o600);
  try {
    for (const f of files) {
      const data = f.data ?? null; const size = data ? data.length : (await fsp.stat(f.file)).size;
      await out.write(header(f.name, size, f.mtime ?? Date.now() / 1000));
      if (data) await out.write(data); else if (size) { for await (const chunk of fs.createReadStream(f.file, { start: 0, end: size - 1 })) await out.write(chunk); }
      if (pad(size)) await out.write(Buffer.alloc(pad(size)));
    }
    await out.write(Buffer.alloc(BLOCK * 2));
  } finally { await out.close(); }
}
