import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
export class WorkerClient {
  constructor() {
    this.pending = new Map();
    this.child = fork(new URL('./worker.mjs', import.meta.url), [], { uid: 1001, gid: 1001,
      env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/home/project', TMPDIR: '/tmp/project' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    this.child.on('message', m => { const p = this.pending.get(m.id); if (!p) return; this.pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(Error(m.error)) : p.resolve(m.result); });
    this.child.on('exit', () => { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(Error('Project worker exited')); } this.pending.clear(); });
  }
  call(type, data = {}) {
    return new Promise((resolve, reject) => { const id = randomUUID(); const timer = setTimeout(() => { this.pending.delete(id); reject(Error('Project operation timed out')); }, type === 'action' ? 125000 : 20000);
      this.pending.set(id, { resolve, reject, timer }); this.child.send({ id, type, ...data }); });
  }
  close() { this.child.kill('SIGKILL'); }
}
