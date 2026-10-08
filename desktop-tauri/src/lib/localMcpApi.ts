import { invoke } from '@tauri-apps/api/core';
import type { LocalSpec, LocalView } from './localMcp';

/** The native commands behind Settings > Local MCP servers. They never return a secret value. */
export const localMcpApi = {
  list: () => invoke<LocalView[]>('local_mcp_list'),
  /** `secrets` holds only values typed now; a name left out (or empty) keeps what is saved. */
  save: (spec: LocalSpec, secrets: Record<string, string>) => invoke<LocalView>('local_mcp_save', { spec, secrets }),
  setEnabled: (id: string, enabled: boolean) => invoke<LocalView>('local_mcp_set_enabled', { id, enabled }),
  retry: (id: string) => invoke<LocalView>('local_mcp_retry', { id }),
  remove: (id: string) => invoke<void>('local_mcp_remove', { id }),
  /** Starts the server, lists its tools and registers them (never the command line) with the account. */
  connect: (id: string) => invoke<unknown>('local_mcp_connect', { id }),
  check: (spec: LocalSpec) => invoke<{ problem: string | null; unpinned: boolean }>('local_mcp_check', { spec }),
  pick: (kind: 'folder' | 'file', title: string) => invoke<string | null>('local_mcp_pick', { kind, title }),
};
