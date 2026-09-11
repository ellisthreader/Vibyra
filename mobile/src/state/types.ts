import type { AccountApi } from '../account/accountApi';
import type { RpcClient } from '../transport/RpcClient';
import type { Pairing } from '../transport/pairing';
import type { Computer, Project, Session, WorkspaceModel } from '../ui/types';
export type RuntimeState = Omit<WorkspaceModel, 'actions'>;
export interface SavedConnection {
  pairing: Pairing; privateKey: string; deviceId?: string; host?: Computer;
  /** Absent means yes. Only the person's own Disconnect writes `false`, so a
   *  computer that was never put away by hand is connected again on its own. */
  autoConnect?: boolean;
}
export interface HostState {
  protocol: number;
  capabilities?: { conversationV1?: boolean; vibesToolsV1?: boolean; readOnly?: boolean; canInput?: boolean };
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
  retryDelays?: number[] }
export interface SavedOnboarding { completedAt: string; mode: 'computer' | 'phone' | null }
export interface SavedAccount { token: string; email: string; name: string; plan: string }
export const initialState: RuntimeState = {
  status: 'offline', error: null, host: null, projects: [], sessions: [], devices: [], approvals: [],
  selectedSessionId: null, output: '', themePreference: 'system', syncing: false, control: 'none',
  onboarding: { status: 'unknown', mode: null }, account: null, reconnecting: false, viewOnly: false, canType: false, terminalFontSize: 13,
};
