import { RpcClient } from '../src/transport/RpcClient';
import { WorkspaceStore } from '../src/state/WorkspaceStore';
import type { HostState } from '../src/state/types';
export const pairing = { version: 1, hostId: 'host1', name: 'Test computer', publicKey: 'ab'.repeat(32),
  url: 'ws://localhost:4318', invite: 'ab'.repeat(32), expiresAt: '2099-01-01T00:00:00Z' };
export const hostState: HostState = { protocol: 1, host: { id: 'host1', name: 'Test computer', platform: 'macOS' },
  projects: [{ id: 'project1', name: 'Example', path: '/safe/example' }], sessions: ['one', 'two'].map(id => ({
    id, projectId: 'project1', kind: 'shell', title: id, status: 'running', createdAt: '2026-09-06T00:00:00Z',
  })), devices: [{ id: 'phone1', name: 'This phone', createdAt: '' }], approvals: [{ id: 'approval1', title: 'Action',
    description: 'Exact host action', createdAt: '', expiresAt: '2099-01-01T00:00:00Z', deviceId: 'phone1' }] };
export const delay = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
/** `memory` and `flags` may be handed back in to mount a second app over the
 *  storage the first one left behind, which is what relaunching the app is. */
export interface HarnessOptions { memory?: Map<string, string>; flags?: Map<string, string>; retryDelays?: number[] }
export function runtimeHarness(options: HarnessOptions = {}) {
  let id = 0; const sent: any[] = []; const memory = options.memory ?? new Map<string, string>();
  const flags = options.flags ?? new Map<string, string>();
  const calls: any[] = []; const user = { email: 'ellis@example.com', name: 'Ellis', plan: 'free' };
  const account = { signup: async (email: string, password: string) => { calls.push(['signup', email, password]); return { token: 'tok-1', user: { ...user, email } }; },
    login: async (email: string, password: string) => { calls.push(['login', email, password]); return { token: 'tok-2', user: { ...user, email } }; },
    session: async (token: string) => { calls.push(['session', token]); return user; },
    logout: async (token: string) => { calls.push(['logout', token]); },
    sendHostLink: async (token: string | null, email?: string) => { calls.push(['host-link', token, email]); return email ?? user.email; } };
  let handler: ((message: any) => boolean) | undefined;
  let connectionId: string | undefined;
  const rpc = new RpcClient(raw => {
    const message = raw as any; sent.push(message);
    queueMicrotask(() => {
      if (handler?.(message)) return;
      if (message.type === 'keygen') rpc.receive({ type: 'keypair', key: 'cd'.repeat(32) });
      if (message.type === 'open') { connectionId = message.connectionId; rpc.receive({ type: 'connected', connectionId, deviceId: 'phone1' }); }
      if (message.type !== 'send') return;
      const { method, params } = message.payload;
      const result = method === 'host.state' ? structuredClone(hostState) : method === 'session.snapshot'
        ? { sessionId: params.sessionId, output: 'hello', offset: 5, generation: 'g1', status: 'running' }
        : method === 'session.claim' ? { lease: 'lease1', generation: 'g1' } : { ok: true };
      reply(message, result);
    });
  }, () => String(++id));
  function reply(message: any, result: unknown) {
    rpc.receive({ type: 'message', connectionId: message.connectionId, payload: { id: message.payload.id, ok: true, result } });
  }
  const store = new WorkspaceStore({ rpc, uuid: () => String(++id), account, storage: {
    read: async key => memory.get(key) ?? null,
    write: async (key, value) => { memory.set(key, value); }, delete: async key => { memory.delete(key); },
  }, flags: {
    read: async key => flags.get(key) ?? null,
    write: async (key, value) => { flags.set(key, value); }, delete: async key => { flags.delete(key); },
  }, retryDelays: options.retryDelays });
  rpc.receive({ type: 'ready' });
  return { store, rpc, sent, memory, flags, calls, account, reply, handle: (callback?: typeof handler) => { handler = callback; },
    event: (event: string, data: unknown) => rpc.receive({ type: 'message', connectionId, payload: { event, seq: 1, data } }) };
}
