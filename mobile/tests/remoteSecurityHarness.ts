import type { RemoteDashboardApi } from '../src/remote/dashboardApi';
import { cloudHarness, hostState, pairing, runtimeHarness } from './runtimeHarness';

export const HOST = 'ab'.repeat(32), SESSION = 'a'.repeat(32), DEVICE = '12345678-1234-1234-1234-123456789abc';
export const CLIENT = 'ce'.repeat(32);
export type Action = 'disconnect' | 'revoke' | 'removePasskey' | 'disconnectAll' | 'revokeAll' | 'disable';
export const targets: Record<Action, any> = { disconnect: SESSION, revoke: DEVICE, removePasskey: 1,
  disconnectAll: [SESSION], revokeAll: undefined, disable: undefined };

export async function connected(cloud = true) {
  const remote = cloudHarness();
  const connect = remote.connect;
  remote.connect = async (...args) => ({ ...await connect(...args), sessionId: SESSION, authorizationId: SESSION });
  let h: ReturnType<typeof runtimeHarness>;
  const calls: string[] = [];
  let complete!: () => void, fail!: (error: Error) => void;
  const work = () => {
    calls.push('server');
    return new Promise<void>((resolve, reject) => { complete = resolve; fail = reject; });
  };
  remote.dashboard = { identity: () => h.store.token, devices: async () => [], sessions: async () => [],
    events: async () => [], passkeys: async () => [], readEvent: async () => {}, disconnect: work,
    revoke: work, removePasskey: work, disconnectAll: work, revokeAll: work, disable: work };
  h = runtimeHarness({ remote, retryDelays: [1, 2] });
  h.handle(message => {
    if (message.type === 'open') {
      h.rpc.receive({ type: 'connected', connectionId: message.connectionId, deviceId: CLIENT }); return true;
    }
    if (message.type === 'send' && message.payload.method === 'host.state') {
      h.reply(message, { ...structuredClone(hostState), host: { ...hostState.host, id: HOST } }); return true;
    }
    return false;
  });
  await h.store.actions.logIn!('ellis@example.com', 'longenough');
  if (cloud) {
    await h.store.actions.connectComputer!(HOST);
    // Real enrollment's device UUID is tested by secureGrant.test; the runtime
    // harness otherwise models the transport and account boundary directly.
    h.store.cloudSecurityScope!.deviceId = DEVICE;
  } else await h.store.actions.connect(JSON.stringify({ ...pairing, hostId: HOST }));
  return { ...h, remote, calls, complete: () => complete(), fail: () => fail(new Error('API unavailable')),
    api: h.store.remoteDashboard! };
}
export const invoke = (api: RemoteDashboardApi, action: Action) => (api[action] as (target?: any) => Promise<void>)(targets[action]);
