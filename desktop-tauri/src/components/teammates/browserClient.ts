import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  parseBrowserAccess, parseBrowserGrant, type BrowserApi,
} from '../../../../mobile/src/agents/v2/browserModel.ts';
import type { HubRequest } from './connectionsClient';

/** Agent V2 browser sites for one teammate on the Mac (Phase 7), the same `BrowserApi` the phone uses. */
export const browserClient = (api: HubRequest): BrowserApi => {
  const path = (agentId: string) => `agents/v2/agents/${agentId}/browser`;
  return {
    get: async agentId => parseBrowserAccess(await api(path(agentId))),
    put: async (agentId, origins) => {
      const grant = parseBrowserGrant((await api<any>(path(agentId), { origins }, 'PUT'))?.browser);
      if (!grant) throw new Error('The service returned invalid browser access. Try refreshing.');
      return grant;
    },
    remove: async agentId => { await api(path(agentId), undefined, 'DELETE'); },
  };
};

/** The bridge reports refusals as "403: words". */
export const refusalStatus = (error: unknown) => Number(/^(\d{3}):/.exec(error instanceof Error ? error.message : String(error))?.[1] ?? 0);

/** A teammate waiting for the person to sign in inside the separate browser. */
export interface BrowserTakeover { runId: string; actionId: string; reason: string; url: string; active: boolean }

const isTakeover = (v: any): v is BrowserTakeover => Boolean(v) && typeof v.runId === 'string' && typeof v.active === 'boolean';

/** Open takeovers now, for a window that mounted after the event. Empty when the command is missing. */
export const browserTakeovers = (): Promise<BrowserTakeover[]> =>
  invoke<unknown>('agent_browser_takeovers').then(list => (Array.isArray(list) ? list.filter(isTakeover) : [])).catch(() => []);

export const onBrowserTakeover = (callback: (takeover: BrowserTakeover) => void): Promise<UnlistenFn> =>
  listen<unknown>('agent-browser-takeover', event => { if (isTakeover(event.payload)) callback(event.payload); });

export const showBrowser = (runId: string) => invoke('agent_browser_show', { runId });
export const resumeBrowser = (runId: string) => invoke('agent_browser_resume', { runId });

/** `https://shop.example.com/login?x` reads as `shop.example.com`. */
export function siteOrigin(url: string): string {
  try { return new URL(url).host || url; } catch { return url; }
}
