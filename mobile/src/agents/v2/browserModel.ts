/**
 * Agent V2 browser access (Phase 7): the sites one teammate may open in the separate browser
 * on the Mac. Pure shapes and list edits, shared by the phone and the Mac (no imports).
 */
export interface BrowserGrant {
  connectionId: string;
  grantId: string;
  origins: string[];
  generation: number;
  updatedAt: string | null;
}
export interface BrowserAccess { enabled: boolean; browser: BrowserGrant | null }
export interface BrowserApi {
  get(agentId: string): Promise<BrowserAccess>;
  /** The whole list, 1–20 sites; the server normalises bare hosts to https. */
  put(agentId: string, origins: string[]): Promise<BrowserGrant>;
  remove(agentId: string): Promise<void>;
}

export const MAX_BROWSER_SITES = 20;
export const BROWSER_WORDS = 'Lets this teammate open only these sites in a separate browser on your Mac. You sign in yourself when it asks.';
/** The browser removes live connections (WebSockets) so nothing can send without approval; sites that need them cannot work. */
export const BROWSER_SOCKET_NOTE = 'Sites that work only over live connections, like chat apps and some dashboards, don’t work in your teammate’s browser.';

export function parseBrowserGrant(value: unknown): BrowserGrant | null {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== 'object' || !Array.isArray(v.origins)) return null;
  return {
    connectionId: typeof v.connectionId === 'string' ? v.connectionId : '',
    grantId: typeof v.grantId === 'string' ? v.grantId : '',
    origins: v.origins.filter((o): o is string => typeof o === 'string'),
    generation: typeof v.generation === 'number' ? v.generation : 0,
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : null,
  };
}

export function parseBrowserAccess(data: unknown): BrowserAccess {
  const v = data as Record<string, unknown> | null;
  const enabled = Boolean(v && v.enabled === true);
  return { enabled, browser: enabled ? parseBrowserGrant(v?.browser) : null };
}

/** `https://example.com` reads as `example.com`; other schemes keep theirs. */
export const siteLabel = (origin: string) => origin.replace(/^https:\/\//, '');

/** The list with `input` added, or the words to show when it cannot be. The server has the final say. */
export function withSite(origins: string[], input: string): string[] | string {
  const site = input.trim().replace(/\/+$/, '');
  if (!site) return 'Enter a site, like example.com.';
  if (/\s/.test(site)) return 'Enter one site at a time, like example.com.';
  const key = siteLabel(site).toLowerCase();
  if (origins.some(o => siteLabel(o).toLowerCase() === key)) return 'That site is already allowed.';
  if (origins.length >= MAX_BROWSER_SITES) return `A teammate can open up to ${MAX_BROWSER_SITES} sites.`;
  return [...origins, site];
}

/** A load refusal that means browser tools are off for this account: hide the block. */
export const browserHidden = (status: number) => status === 403 || status === 404 || status === 503;
