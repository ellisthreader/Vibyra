export class Client {
  constructor(origin, workspace, token) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.username || url.password) throw Error('HTTPS control plane required');
    this.base = `${origin.replace(/\/$/, '')}/api/cloud-runtime/${workspace}`; this.token = token;
  }
  async call(path, body) {
    const response = await fetch(this.base + path, { method: body === undefined ? 'GET' : 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    if (!response.ok) { const error = Error(`Control request refused (${response.status})`); error.status = response.status; throw error; }
    const result = await response.json(); if (!result.ok) throw Error('Invalid control response'); return result;
  }
}
