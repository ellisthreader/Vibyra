import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { until } from './ui-test-helpers.mjs';
export async function sharedChatProbe() {
  const dir = mkdtempSync(join(tmpdir(), 'vibyra-shared-chat-'));
  writeFileSync(join(dir, 'README.md'), 'Isolated shared conversation verification.\n');
  const child = spawn(resolve('../desktop-tauri/src-tauri/target/debug/examples/shared_chat_probe'), [dir, join(dir, '.state')], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', lines = '', sequence = 0;
  const pending = new Map(); const approved = new Set();
  const consume = bytes => {
    output += bytes.toString(); lines += bytes.toString();
    for (const match of output.matchAll(/Approve or deny device ([a-f0-9]{64})/g)) {
      if (!approved.has(match[1])) { approved.add(match[1]); child.stdin.write(`approve ${match[1]}\n`); }
    }
    let end;
    while ((end = lines.indexOf('\n')) >= 0) {
      const line = lines.slice(0, end); lines = lines.slice(end + 1);
      if (!line.startsWith('local-result ')) continue;
      const reply = JSON.parse(line.slice(13));
      const request = pending.get(reply.id); pending.delete(reply.id);
      if (reply.error) request?.reject(new Error(reply.error)); else request?.resolve(reply.result);
    }
  };
  child.stdout.on('data', consume); child.stderr.on('data', bytes => { output += bytes.toString(); consume(''); });
  const encoded = await until(() => output.match(/vibyra:\/\/pair\?data=([\w-]+)/)?.[1], 'shared Desktop invitation', 60000).catch(error => { child.kill(); throw new Error(`${error}\n${output}`); });
  const session = JSON.parse(output.match(/^session (.+)$/m)[1]);
  const pairing = JSON.parse(Buffer.from(encoded, 'base64url').toString());
  const local = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject });
    child.stdin.write(`local ${JSON.stringify({ id, method, params })}\n`);
  });
  return { dir, pairing, session, local, typing: enabled => child.stdin.write(`typing ${enabled ? 'on' : 'off'}\n`),
    close: async () => { child.stdin.end(); await until(() => child.exitCode !== null || child.signalCode !== null, 'probe shutdown', 6000).catch(() => child.kill()); } };
}
