import type { AccountApi } from '../account/accountApi';
import type { RemoteApi } from '../remote/remoteApi';
import type { NearbyComputer } from '../connection/discoveryTypes';
import type { RpcClient } from '../transport/RpcClient';
import type { Pairing } from '../transport/pairing';
import type { Account, Computer, Project, Session, WorkspaceModel } from '../ui/types';
export type RuntimeState = Omit<WorkspaceModel, 'actions'>;
export interface SavedConnection {
  pairing: Pairing; privateKey: string; deviceId?: string; host?: Computer;
  /** Absent means yes. Only the person's own Disconnect writes `false`, so a
   *  computer that was never put away by hand is connected again on its own. */
  autoConnect?: boolean;
}
export interface HostState {
  nextCursor?: string | null;
  protocol: number;
  capabilities?: { conversationV1?: boolean; vibesToolsV1?: boolean; scaffoldV1?: boolean; readOnly?: boolean; canInput?: boolean; canManage?: boolean };
  host: Computer;
  projects: Project[];
  sessions: Session[];
  devices: { id: string; name: string; createdAt: string }[];
  approvals: { id: string; title: string; description: string; createdAt: string; expiresAt: string; deviceId: string }[];
}
export interface SecureStorage {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
// `storage` holds secrets (trust keys, the account token). `flags` holds non-secret device state such as
// whether the welcome flow has been completed; on the web it may persist across reloads.
export interface RuntimeDependencies { rpc: RpcClient; storage: SecureStorage; flags: SecureStorage; account: AccountApi; uuid(): string; iosConversations?: boolean;
  /** How long to wait between automatic reconnection attempts. Tests shorten it. */
  retryDelays?: number[];
  /** Finds a trusted computer on the network this phone is on now, by the key
   *  its connection is pinned to, once it stops answering where it was. */
  locate?(publicKey: string): Promise<NearbyComputer | undefined>;
  /** Vibyra Cloud: the account's computers and grants to reach them from anywhere. */
  remote?: RemoteApi }
export interface SavedOnboarding { completedAt: string; mode: 'computer' | 'phone' | null }
/** The account as the server last described it, beside its token, so a relaunch opens on it. */
export interface SavedAccount extends Account { token: string }
export const initialState: RuntimeState = {
  status: 'offline', error: null, host: null, projects: [], sessions: [], devices: [], approvals: [],
  selectedSessionId: null, output: '', themePreference: 'system', accent: 'cobalt', syncing: false, control: 'none',
  onboarding: { status: 'unknown', mode: null }, account: null, reconnecting: false, viewOnly: false, canType: false, canManage: false, terminalFontSize: 13,
  hostGrid: null,
};
