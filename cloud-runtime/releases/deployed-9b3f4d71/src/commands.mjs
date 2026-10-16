import { spawn } from 'node:child_process';
export class Commands {
  processes = new Set();
  kill() { for (const child of this.processes) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } }
  run(command, root, remainingMs) {
    if (typeof command !== 'string' || command.length > 500 || remainingMs <= 0) throw Error('Invalid command');
    return new Promise((resolve, reject) => {
      const child = spawn('/bin/sh', ['-c', command], { cwd: root, detached: true,
        env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/home/project', TMPDIR: '/tmp/project', CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
      this.processes.add(child); let stdout = '', stderr = '', truncated = false;
      const append = (key, b) => { let current = key === 'out' ? stdout : stderr; if (Buffer.byteLength(current) + b.length > 32768) truncated = true;
        current = Buffer.concat([Buffer.from(current), b]).subarray(0, 32768).toString(); if (key === 'out') stdout = current; else stderr = current; };
      child.stdout.on('data', b => append('out', b)); child.stderr.on('data', b => append('err', b));
      const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, Math.min(120000, remainingMs));
      child.on('error', e => { clearTimeout(timer); this.processes.delete(child); reject(e); });
      child.on('close', (code, signal) => { clearTimeout(timer); this.processes.delete(child); resolve({ exitCode: code, signal, stdout, stderr, truncated }); });
    });
  }
}
