export type RemotePermission = 'preview:access' | 'screen:view' | 'mouse:control' | 'keyboard:control' |
  'clipboard:read' | 'clipboard:write' | 'terminal:access' | 'files:read' | 'files:download' | 'files:upload';
export interface RemoteDevice {
  id: string; hostId: string; publicKey: string; deviceName: string;
  pairingCode: string; approvedAt: string | null; deniedAt: string | null;
  revokedAt: string | null; requestExpiresAt: string | null;
  permissions: RemotePermission[];
}
export interface DeviceChallenge {
  challengeId: string; ciphertext: string; deviceId: string; hostId: string;
  purpose: 'connect' | 'passkey'; permissions: RemotePermission[];
  pairingCode?: string;
}
export interface RemoteAuthorization {
  deviceId: string; challengeId: string; proof: string; permissions: RemotePermission[];
}
export interface RemoteSecurityApi {
  register(hostId: string, publicKey: string, permissions: RemotePermission[]): Promise<RemoteDevice>;
  device(id: string): Promise<RemoteDevice>;
  challenge(id: string, purpose: 'connect' | 'passkey', permissions?: RemotePermission[]): Promise<DeviceChallenge>;
  hasPasskeys(): Promise<boolean>;
  begin(deviceId: string, purpose: 'register' | 'authenticate', challengeId: string, proof: string): Promise<{ id: string; url: string }>;
  ceremony(id: string): Promise<'waiting' | 'verified' | 'failed' | 'expired'>;
  session(id: string): Promise<string>;
  sessionToken(id: string, authorization: RemoteAuthorization): Promise<import('./remoteApi').CloudGrant>;
  disconnectSession(id: string): Promise<void>;
}
export interface RemoteSecurityProgress { stage: 'approval' | 'authentication'; pairingCode?: string }
