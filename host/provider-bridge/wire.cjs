// Embedded by the Host. Only standard Node APIs; no downloaded bridge code.
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const output = value => process.stdout.write(JSON.stringify(value) + '\n');
const event = (method, params) => output({ method, params });
function lines(stream, receive, failure) {
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    pending += chunk;
    if (Buffer.byteLength(pending) > 1024 * 1024) { failure(new Error('Provider output exceeded its limit')); return; }
    let end;
    while ((end = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, end); pending = pending.slice(end + 1);
      if (!line.trim()) continue;
      try { receive(JSON.parse(line)); } catch (error) { failure(error); }
    }
  });
}
class ProviderWire {
  constructor(program, args, receive) {
    this.pending = new Map();
    this.child = spawn(program, args, { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
    this.child.stderr.resume();
    const fail = error => { for (const request of this.pending.values()) request.reject(error); this.pending.clear(); this.child.kill(); };
    this.child.on('error', fail);
    this.child.on('exit', () => { fail(new Error('Provider connection ended')); process.exitCode = 1; process.stdin.destroy(); });
    lines(this.child.stdout, receive, fail);
    process.on('exit', () => this.child.kill());
  }
  write(value) { this.child.stdin.write(JSON.stringify(value) + '\n'); }
  request(value, id) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Provider acknowledgement timed out')); }, 22000);
      this.pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } });
      this.write(value);
    });
  }
  reply(id, result, error) { const request = this.pending.get(id); this.pending.delete(id); if (error) request?.reject(new Error(error)); else request?.resolve(result); }
}
function normalizedModels(models) {
  return models.map(model => ({ model: model.value, resolvedModel: model.resolvedModel, displayName: model.displayName, description: model.description,
    defaultReasoningEffort: model.supportedEffortLevels?.includes('high') ? 'high' : model.supportedEffortLevels?.[0] ?? 'none',
    supportedReasoningEfforts: (model.supportedEffortLevels?.length ? model.supportedEffortLevels : ['none']).map(reasoningEffort => ({ reasoningEffort, description: '' })) }));
}
