import { invoke } from '@tauri-apps/api/core';

export interface RemoteScope { accountScope: string; hostId: string }
export interface RemoteDevice {
  id: string; hostId: string; publicKey: string; deviceName: string; permissions: string[];
  pairingCode: string; lastIp: string | null; approvedAt: string | null; revokedAt: string | null;
  lastSeenAt: string | null; requestExpiresAt: string;
}
export interface RemoteSession {
  id: string; hostId: string; clientName: string | null; status: string; permissions?: string[];
  issuedAt: string; connectedAt: string | null; expiresAt: string; endedAt: string | null;
}
export type RemoteMode = 'ask' | 'trusted' | 'disabled';
export interface PendingRemoteSession { id: string; publicKey: string; clientName: string; permissions: string[]; requestedAt: string }
export interface RemoteSecuritySnapshot {
  computer?: { id: string; name: string; online: boolean } | null;
  scope: RemoteScope; security: { mode: RemoteMode; enabled: boolean } | null; pendingSessions: PendingRemoteSession[]; pendingDevices: RemoteDevice[]; devices: RemoteDevice[]; sessions: RemoteSession[];
  passkeys: { id: number; device_name: string; created_at: string; last_used_at: string | null }[];
  events: { id: string; title: string; createdAt: string; metadata: { computer?: string; client?: string; device?: string } }[];
}
export const remoteSecuritySnapshot = () => invoke<RemoteSecuritySnapshot>('remote_security_snapshot');
export const remoteDecideDevice = (scope: RemoteScope, device: RemoteDevice, approve: boolean) => invoke<void>('remote_security_decide_device', {
  scope, decision: { id: device.id, publicKey: device.publicKey, pairingCode: device.pairingCode, permissions: device.permissions, approve },
});
export const remoteRevoke = (scope: RemoteScope, kind: 'device' | 'session' | 'devices' | 'passkey', id: string, target: Pick<RemoteDevice, 'hostId' | 'publicKey'> | null = null) => invoke<void>('remote_security_revoke', { scope, kind, id, target });
export const permissionLabels: Record<string, string> = {
  'screen:view': 'View screen', 'preview:access': 'Open project Preview (including signed-in websites)',
  'mouse:control': 'Control mouse', 'keyboard:control': 'Control keyboard',
  'terminal:access': 'Access terminals and agents (can run commands)',
  'clipboard:read': 'Read clipboard', 'clipboard:write': 'Write clipboard',
  'files:read': 'Read files', 'files:download': 'Download files', 'files:upload': 'Upload files',
};

export const remoteDecideSession = (scope: RemoteScope, session: PendingRemoteSession, allow: boolean) => invoke<void>('remote_security_decide_session', {
  scope, decision: { id: session.id, publicKey: session.publicKey, permissions: session.permissions, allow },
});
export const remoteSetMode = (scope: RemoteScope, mode: RemoteMode) => invoke<void>('remote_security_set_mode', { scope, mode });
export const remoteDisableAll = (scope: RemoteScope) => invoke<void>('remote_security_disable_all', { scope });
