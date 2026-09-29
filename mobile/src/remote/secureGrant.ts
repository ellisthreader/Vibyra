import type { WorkspaceStore } from '../state/WorkspaceStore';
import { RemoteApprovalRequired, type CloudGrant } from './remoteApi';
import type { RemoteDevice, RemotePermission, RemoteSecurityApi } from './securityTypes';
import type { ProviderBrowser } from '../account/browserProvider';

interface Identity { privateKey: string; deviceId?: string; permissions: RemotePermission[] }
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 1500));
const sorted = (value: string[]) => [...new Set(value)].sort().join(',');
function checkDevice(device: RemoteDevice, hostId: string, publicKey: string) {
  if (device.hostId !== hostId || device.publicKey !== publicKey) throw new Error('The computer or device identity changed. Pair again.');
  if (device.revokedAt || device.deniedAt) throw new Error('This device was denied or revoked. Approve a new connection on your computer.');
  if (!device.approvedAt && (!device.requestExpiresAt || Date.parse(device.requestExpiresAt) <= Date.now()))
    throw new Error('This device request expired. Connect again to ask for approval.');
}

/** Every production Cloud path uses this boundary. Reconnects can reuse fresh
 * server-side step-up state but cannot open a biometric browser unprompted. */
export async function secureGrant(store: WorkspaceStore, hostId: string,
  permissions?: RemotePermission[], interactive = false,
  wait = pause): Promise<{ grant: CloudGrant; privateKey: string }> {
  const remote = store.deps.remote;
  if (!remote?.security || !store.token || !store.state.account) throw new Error('Sign in to connect securely.');
  const api = remote.security;
  const epoch = store.epoch, owner = store.token, account = store.state.account.email;
  store.cloudSecurityScope = { owner, hostId };
  const guard = () => {
    store.assertCurrent(epoch);
    if (store.token !== owner || store.state.account?.email !== account) throw new Error('The signed-in account changed. Connect again.');
  };
  const key = `remote-device:${account}:${hostId}`;
  // On web this reserves a popup during the explicit user action.
  const browser = interactive ? store.deps.remoteBrowser?.() : undefined;
  let pendingSession: string | undefined;
  let admitted = false;
  try {
    let identity: Identity | null = null;
    try { identity = JSON.parse((await store.deps.storage.read(key)) ?? 'null'); } catch { /* replace malformed storage */ }
    guard();
    if (!identity || !/^[a-f0-9]{64}$/.test(identity.privateKey)) {
      if (!interactive) throw new Error('Open Connect to approve this device for Vibyra Cloud.');
      const saved = store.saved;
      identity = { privateKey: saved?.pairing.publicKey === hostId ? saved.privateKey : await store.deps.rpc.createKeypair(), permissions: [] };
      guard();
      await store.deps.storage.write(key, JSON.stringify(identity));
    }
    const selected = permissions ?? identity.permissions;
    if (!Array.isArray(selected) || !selected.length) throw new Error('Choose Preview or Terminals before connecting.');
    const publicKey = (await store.deps.rpc.deviceProof(identity.privateKey)).publicKey;
    guard();
    let device = interactive
      ? await api.register(hostId, publicKey, selected)
      : identity.deviceId ? await api.device(identity.deviceId) : null;
    guard();
    if (!device) throw new Error('Open Connect to approve this device for Vibyra Cloud.');
    const approvedPermissions = device.permissions;
    if (selected.some(permission => !approvedPermissions.includes(permission)))
      throw new Error('This device has different approved permissions. Revoke it in Settings → Security → Remote access, then connect again for desktop approval.');
    identity = { privateKey: identity.privateKey, deviceId: device.id, permissions: selected };
    await store.deps.storage.write(key, JSON.stringify(identity));
    guard();
    checkDevice(device, hostId, publicKey);
    store.cloudSecurityScope = { owner, hostId, deviceId: device.id };
    const until = Date.now() + 10 * 60 * 1000;
    while (!device.approvedAt) {
      if (!interactive) throw new Error('Approve this device on your computer before connecting.');
      if (Date.now() >= until) throw new Error('This device request expired. Connect again.');
      store.update({ remoteSecurity: { stage: 'approval', pairingCode: device.pairingCode } });
      await wait(); guard();
      device = await api.device(device.id); guard(); checkDevice(device, hostId, publicKey);
    }
    if (interactive) {
      if (!browser) throw new Error('Passkey verification is not available on this build.');
      store.update({ remoteSecurity: { stage: 'authentication' } });
      await verifyPasskey(api, device, identity.privateKey, store, browser, guard, wait);
      browser.close();
    }
    const challenge = await api.challenge(device.id, 'connect', selected); guard();
    if (challenge.hostId !== hostId || sorted(challenge.permissions) !== sorted(selected))
      throw new Error('The connection permissions changed. Connect again.');
    const answer = await store.deps.rpc.deviceProof(identity.privateKey, challenge.ciphertext); guard();
    if (answer.publicKey !== publicKey || !answer.proof) throw new Error('The device identity changed.');
    const authorization = { deviceId: device.id, challengeId: challenge.challengeId, proof: answer.proof, permissions: selected };
    let grant: CloudGrant;
    try { grant = await remote.connect(hostId, authorization); }
    catch (error) {
      if (!(error instanceof RemoteApprovalRequired)) throw error;
      pendingSession = error.sessionId;
      guard(); store.update({ remoteSecurity: { stage: 'approval' } });
      store.cloudSecurityScope = { owner, hostId, deviceId: device.id, sessionId: error.sessionId };
      const deadline = Date.now() + 5 * 60 * 1000;
      while (true) {
        const status = await api.session(error.sessionId); guard();
        if (status === 'AUTHORIZED') break;
        if (status !== 'WAITING_FOR_APPROVAL' || Date.now() >= deadline)
          throw new Error('This connection was denied, revoked or expired. Connect again.');
        await wait(); guard();
      }
      const next = await api.challenge(device.id, 'connect', selected); guard();
      if (next.hostId !== hostId || sorted(next.permissions) !== sorted(selected)) throw new Error('Connection permissions changed.');
      const proof = await store.deps.rpc.deviceProof(identity.privateKey, next.ciphertext); guard();
      if (!proof.proof || proof.publicKey !== publicKey) throw new Error('Device verification failed.');
      grant = await api.sessionToken(error.sessionId, { ...authorization, challengeId: next.challengeId, proof: proof.proof });
    }
    guard();
    if (grant.host.id !== hostId) throw new Error('The computer identity changed. Connect again.');
    admitted = true;
    store.cloudSecurityScope = { owner, hostId, deviceId: device.id, sessionId: grant.sessionId };
    return { grant, privateKey: identity.privateKey };
  } finally {
    browser?.close();
    if (pendingSession && !admitted && store.token === owner) void api.disconnectSession(pendingSession).catch(() => {});
    if (store.current(epoch)) store.update({ remoteSecurity: undefined });
  }
}

async function verifyPasskey(api: RemoteSecurityApi, device: RemoteDevice, privateKey: string,
  store: WorkspaceStore, browser: ProviderBrowser, guard: () => void, wait: () => Promise<void>) {
  const hasPasskeys = await api.hasPasskeys(); guard();
  const challenge = await api.challenge(device.id, 'passkey'); guard();
  if (challenge.hostId !== device.hostId || challenge.permissions.length) throw new Error('The verification request changed.');
  const answer = await store.deps.rpc.deviceProof(privateKey, challenge.ciphertext); guard();
  if (answer.publicKey !== device.publicKey || !answer.proof) throw new Error('The device identity changed.');
  const ceremony = await api.begin(device.id, hasPasskeys ? 'authenticate' : 'register', challenge.challengeId, answer.proof); guard();
  browser.open(ceremony.url);
  const until = Date.now() + 5 * 60 * 1000;
  while (Date.now() < until) {
    const status = await api.ceremony(ceremony.id); guard();
    if (status === 'verified') return;
    if (status !== 'waiting') throw new Error('Passkey verification expired or failed. Connect again.');
    if (browser.closed()) throw new Error('Passkey verification was cancelled.');
    await wait(); guard();
  }
  throw new Error('Passkey verification expired. Connect again.');
}
