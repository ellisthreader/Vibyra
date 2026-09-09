import type { AccountApi } from '../account/accountApi';
import type { RpcClient } from '../transport/RpcClient';
import type { Pairing } from '../transport/pairing';
import type { Computer, Project, Session, WorkspaceModel } from '../ui/types';
export type RuntimeState = Omit<WorkspaceModel, 'actions'>;
export interface SavedConnection { pairing: Pairing; privateKey: string; deviceId?: string; host?: Computer }
export interface HostState {
  protocol: number;
  capabilities?: { conversationV1?: boolean; vibesToolsV1?: boolean };
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
export interface RuntimeDependencies { rpc: RpcClient; storage: SecureStorage; flags: SecureStorage; account: AccountApi; uuid(): string; iosConversations?: boolean }
export interface SavedOnboarding { completedAt: string; mode: 'computer' | 'phone' | null }
export interface SavedAccount { token: string; email: string; name: string; plan: string }
export const initialState: RuntimeState = {
  status: 'offline', error: null, host: null, projects: [], sessions: [], devices: [], approvals: [],
  selectedSessionId: null, output: '', themePreference: 'system', syncing: false, control: 'none',
  onboarding: { status: 'unknown', mode: null }, account: null,
};
