/**
 * Provider words for Agent v2 (contract §6d): the server names the provider on every action
 * and tool event, so clients only turn that id into a label. Nothing here guesses a provider
 * from a tool name. Pure — no runtime imports — so the Mac imports it too.
 */
const NAMES: Record<string, string> = {
  gmail: 'Gmail', github: 'GitHub', google_calendar: 'Google Calendar', google_drive: 'Google Drive',
  google_tasks: 'Google Tasks', slack: 'Slack', notion: 'Notion', linear: 'Linear', figma: 'Figma',
  outlook_mail: 'Outlook Mail', outlook_calendar: 'Outlook Calendar', onedrive: 'OneDrive', teams: 'Microsoft Teams',
  sharepoint: 'SharePoint', computer: 'Your Mac', browser: 'Browser', stripe: 'Stripe',
};

// An MCP server's provider id (`mcp_ab12cd34`) says nothing, so its own name ("Notion", "PayPal") is remembered when the
// account list is read; until then, and for a server never listed in this session, it is "Remote tools".
const serverNames = new Map<string, string>();
export function rememberServerNames(connections: { provider: string; name: string; mcp: unknown }[]): void {
  for (const c of connections) if (c.mcp && c.name.trim() && c.provider.startsWith('mcp_')) serverNames.set(c.provider, c.name.trim());
}

/** "Gmail", "Google Calendar"; an MCP server or unknown id gets a readable fallback, never a raw slug. */
export function providerName(provider: string | null | undefined, fallback = 'A connected service'): string {
  if (!provider) return fallback;
  if (NAMES[provider]) return NAMES[provider]!;
  if (/^mcp_[0-9a-f]{8}$/.test(provider)) return serverNames.get(provider) ?? 'Remote tools';
  if (provider.startsWith('composio_')) return providerName(provider.slice(9), fallback);
  const words = provider.replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : fallback;
}

/** The id a brand mark is drawn from: an MCP server shares one mark. */
export const markId = (provider: string | null | undefined): string => (provider?.startsWith('mcp_') ? 'mcp' : provider ?? 'unknown');

/** A tool name without its provider prefix, in words: `gmail_send` → "Send". */
export function toolWords(tool: string, provider?: string | null): string {
  let name = tool.includes('__') ? tool.slice(tool.indexOf('__') + 2) : tool;
  if (provider && name.startsWith(`${provider}_`)) name = name.slice(provider.length + 1);
  else if (!tool.includes('__')) name = name.replace(/^[a-z]+_/, '');
  name = name.replace(/_/g, ' ').trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : tool;
}
