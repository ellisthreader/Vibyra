import type { RpcClient } from '../transport/RpcClient';
import type { Pairing } from '../transport/pairing';
import type { Computer, Project, Session, WorkspaceModel } from '../ui/types';
export type RuntimeState = Omit<WorkspaceModel, 'actions'>;
export interface SavedConnection { pairing: Pairing; privateKey: string; deviceId?: string; host?: Computer }
export interface HostState {
  protocol: number;
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
export interface RuntimeDependencies { rpc: RpcClient; storage: SecureStorage; uuid(): string }
export const initialState: RuntimeState = {
  status: 'offline', error: null, host: null, projects: [], sessions: [], devices: [], approvals: [],
  selectedSessionId: null, output: '', themePreference: 'system', syncing: false, control: 'none',
};
