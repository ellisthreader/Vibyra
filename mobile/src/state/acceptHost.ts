import type { WorkspaceStore } from './WorkspaceStore';
import type { RailwayStatus } from '../ui/types';
import type { HostState } from './types';

/**
 * What a computer's `host.state` answer becomes on the phone: checked against
 * the pairing this phone holds, then laid into the store as projects, sessions,
 * capabilities and the approvals addressed to this device.
 */
export function acceptHost(store: WorkspaceStore, result: HostState) {
  if (result.protocol !== 1 || result.host?.id !== store.saved?.pairing.hostId || !Array.isArray(result.sessions) ||
      !Array.isArray(result.projects) || !Array.isArray(result.devices) || !Array.isArray(result.approvals)) {
    throw new Error('The computer returned an unsupported workspace. Pair it again.');
  }
  const sessions = result.sessions.map(item => item.status === 'exited' ? { ...item,
    exitCode: item.exitCode ?? store.state.sessions.find(previous => previous.id === item.id)?.exitCode } : item);
  store.update({ host: result.host, projects: result.projects, sessions,
    railway: railwayStatus(result.railway),
    vibesToolsAvailable: result.capabilities?.vibesToolsV1 === true, scaffoldAvailable: result.capabilities?.scaffoldV1 === true,
    remembered: result.projects.length > 0 ? { projects: result.projects, seenAt: new Date().toISOString() } : store.state.remembered,
    // A Vibyra Desktop says so up front. Without keeping it, every screen
    // outside a session offers work this connection will refuse to start.
    viewOnly: result.capabilities?.readOnly === true,
    // Separate from viewOnly: a desktop that still refuses to start or stop
    // work can nonetheless let a phone type into the terminals it shares.
    canType: result.capabilities?.canInput === true, canManage: result.capabilities?.canManage === true,
    conversationAvailable: store.deps.iosConversations === true && result.capabilities?.conversationV1 === true,
    conversationProviders: result.capabilities?.conversationProviders ?? ['codex'],
    devices: result.devices.map(item => ({ id: item.id, name: item.name, current: item.id === store.saved?.deviceId })),
    approvals: result.approvals.filter(item => item.deviceId === store.saved?.deviceId)
      .map(item => ({ id: item.id, title: item.title, detail: item.description, expiresAt: item.expiresAt })) });
  if (store.state.selectedSessionId && !result.sessions.some(item => item.id === store.state.selectedSessionId)) store.clearSession();
}

/** Only the three states the Mac can actually be in; anything else reads as "said nothing". */
function railwayStatus(value: HostState['railway']): RailwayStatus | null {
  if (!value || typeof value !== 'object') return null;
  const status = value.status;
  if (status !== 'ready' && status !== 'signedOut' && status !== 'missing') return null;
  return { status, account: typeof value.account === 'string' && value.account ? value.account : null };
}
