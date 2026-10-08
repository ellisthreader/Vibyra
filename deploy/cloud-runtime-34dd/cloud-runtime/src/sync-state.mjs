import fs from 'node:fs/promises';
import path from 'node:path';

/** Small per-project JSON (last tree, seqs, Mac cwd, sent transcripts) kept beside the sync key; written atomically by the uid-1001 worker. */
export function stateStore(syncDir) {
  const dir = path.join(syncDir, 'state'); const file = name => path.join(dir, `${name}.json`);
  return {
    async get(name) { try { return JSON.parse(await fs.readFile(file(name), 'utf8')); } catch { return {}; } },
    async set(name, patch) {
      const next = { ...(await this.get(name)), ...patch }; await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      const tmp = `${file(name)}.${process.pid}.tmp`; await fs.writeFile(tmp, JSON.stringify(next), { mode: 0o600 }); await fs.rename(tmp, file(name)); return next;
    },
    remove: name => fs.rm(file(name), { force: true }),
  };
}
