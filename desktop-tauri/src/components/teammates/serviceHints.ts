// Which connected service a draft message is probably about, and whether the
// teammate can use it. Mirrors the core words of the backend's
// `ConnectorSelection::TERMS`, so the hint appears for the messages that would
// pick that service. Pure: the catalogue and the grants come in as arguments.

export interface HintItem { id: string; name: string; installed: boolean; credential: { configured: boolean; kind?: string } }
export type HintKind = 'allow' | 'connect' | 'reconnect';
export interface AccessHint { kind: HintKind; item: HintItem }

const TERMS: Record<string, string[]> = {
  gmail: ['email', 'mail', 'inbox', 'gmail', 'newsletter', 'unread'],
  outlook_mail: ['email', 'mail', 'inbox', 'outlook', 'newsletter', 'unread'],
  google_calendar: ['calendar', 'meeting', 'schedule', 'agenda'],
  outlook_calendar: ['calendar', 'meeting', 'schedule', 'agenda', 'outlook'],
  google_drive: ['drive', 'doc', 'sheet', 'slide', 'file'],
  google_tasks: ['task', 'todo', 'to-do', 'reminder'],
  github: ['github', 'repo', 'repository', 'pr', 'pull request'],
  figma: ['figma', 'design'],
  stripe: ['stripe', 'payment', 'revenue'],
  slack: ['slack'],
  notion: ['notion'],
  linear: ['linear', 'issue', 'ticket'],
  deepwiki: ['deepwiki', 'docs'],
  hackernews: ['hackernews', 'hacker news'],
};
/** Services that do the same job: one ready member means no nag for the rest. */
const FAMILY: Record<string, string> = { gmail: 'mail', outlook_mail: 'mail', google_calendar: 'calendar', outlook_calendar: 'calendar' };
const family = (id: string) => FAMILY[id] ?? id;

const escape = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Word-boundary match like the backend; a trailing "s" (emails, docs) counts. */
export function mentions(text: string, term: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escape(term.toLowerCase())}s?(?![\\p{L}\\p{N}_])`, 'u').test(text.toLowerCase());
}

function about(text: string, item: HintItem): boolean {
  const names = [item.name, item.id.replace(/_/g, ' ')].filter(Boolean);
  return names.some(name => mentions(text, name)) || (TERMS[item.id] ?? []).some(term => mentions(text, term));
}

const RANK: Record<HintKind, number> = { allow: 0, reconnect: 1, connect: 2 };

function stateOf(item: HintItem, granted: boolean): HintKind | 'ready' | null {
  if (item.installed) return granted ? 'ready' : 'allow';
  if (!item.credential.configured) return null;
  return granted ? 'reconnect' : 'connect';
}

export function accessHint(text: string, agentIntegrations: string[], items: HintItem[]): AccessHint | null {
  if (!text.trim()) return null;
  const families = new Map<string, { first: number; ready: boolean; best: AccessHint | null }>();
  items.forEach((item, index) => {
    if (!about(text, item)) return;
    const key = family(item.id), entry = families.get(key) ?? { first: index, ready: false, best: null };
    const state = stateOf(item, agentIntegrations.includes(item.id));
    if (state === 'ready') entry.ready = true;
    else if (state && (!entry.best || RANK[state] < RANK[entry.best.kind])) entry.best = { kind: state, item };
    families.set(key, entry);
  });
  const open = [...families.values()].filter(entry => !entry.ready && entry.best).sort((a, b) => a.first - b.first);
  return open[0]?.best ?? null;
}

export const hintCopy: Record<HintKind, (name: string) => { text: string; action: string }> = {
  allow: name => ({ text: `${name} is connected, but this teammate can't use it yet.`, action: `Allow ${name}` }),
  connect: name => ({ text: `${name} isn't connected.`, action: `Connect ${name}` }),
  reconnect: name => ({ text: `${name} was disconnected.`, action: `Reconnect ${name}` }),
};
