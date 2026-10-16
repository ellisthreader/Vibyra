import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';

const loopback = h => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(h);
/**
 * Runtime sync endpoints (docs/cloud-sync-contract.md "Runtime API"). JSON calls mirror client.mjs; blob bodies are streamed
 * with node:http so a 500 MiB sealed stream never sits in memory and the upload carries a Content-Length.
 * `token` may be a string or a function (the worker re-reads the token file on every call).
 */
export class SyncClient {
  constructor(origin, workspace, token, { timeoutMs = 15000 } = {}) {
    const url = new URL(origin);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback(url.hostname))) || url.username || url.password) throw Error('HTTPS control plane required');
    this.base = `${origin.replace(/\/$/, '')}/api/cloud-runtime/${workspace}/sync`; this.token = token; this.timeoutMs = timeoutMs;
  }
  #auth() { return `Bearer ${typeof this.token === 'function' ? this.token() : this.token}`; }
  async call(path, body) {
    const response = await fetch(this.base + path, { method: body === undefined ? 'GET' : 'POST', redirect: 'error',
      headers: { Authorization: this.#auth(), Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(this.timeoutMs) });
    if (!response.ok) { const error = Error(`Sync request refused (${response.status})`); error.status = response.status; throw error; }
    const result = await response.json(); if (!result.ok) throw Error('Invalid sync response'); return result;
  }
  publishKey(publicKey) { return this.call('/key', { publicKey }); }
  macs() { return this.call('/macs'); }
  pending() { return this.call('/pending'); }
  state() { return this.call('/state'); }
  /** `report` = {applying, keyOk, lastError} (a bare boolean still means `applying`). */
  status(report) { const r = typeof report === 'object' && report ? report : { applying: report }; return this.call('/status', { applying: !!r.applying, ...('keyOk' in r ? { keyOk: !!r.keyOk } : {}), ...('lastError' in r ? { lastError: r.lastError } : {}) }); }
  applied(id, body) { return this.call(`/blobs/${encodeURIComponent(id)}/applied`, body); }
  #raw(method, pathname, headers, bodyFile) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.base + pathname); const mod = url.protocol === 'https:' ? https : http;
      const req = mod.request(url, { method, headers: { Authorization: this.#auth(), ...headers }, timeout: this.timeoutMs }, resolve);
      req.on('timeout', () => req.destroy(Error('sync request timed out'))); req.on('error', reject);
      if (bodyFile) pipeline(fs.createReadStream(bodyFile), req).catch(reject); else req.end();
    });
  }
  /** Streams a sealed blob to `destFile`; resolves {bytes, sha256}. */
  async download(id, destFile) {
    const res = await this.#raw('GET', `/blobs/${encodeURIComponent(id)}`, { Accept: 'application/octet-stream' });
    if (res.statusCode !== 200) { res.resume(); throw Object.assign(Error(`Blob download refused (${res.statusCode})`), { status: res.statusCode }); }
    const hash = crypto.createHash('sha256'); let bytes = 0;
    res.on('data', c => { hash.update(c); bytes += c.length; });
    await pipeline(res, fs.createWriteStream(destFile, { mode: 0o600 })); return { bytes, sha256: hash.digest('hex') };
  }
  /** Uploads a sealed file to one Mac. Resolves the JSON reply; rejects with `.status` on any non-2xx. */
  async upload(project, { kind, seq, baseSeq, head, sha256, mac, file }) {
    const q = new URLSearchParams({ kind, seq: String(seq), baseSeq: String(baseSeq), head: head ?? '-', sha256, mac });
    const size = (await fs.promises.stat(file)).size;
    const res = await this.#raw('PUT', `/projects/${encodeURIComponent(project)}/down?${q}`, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(size) }, file);
    const chunks = []; for await (const c of res) chunks.push(c);
    if (res.statusCode < 200 || res.statusCode >= 300) throw Object.assign(Error(`Upload refused (${res.statusCode})`), { status: res.statusCode });
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return { ok: true }; }
  }
}
