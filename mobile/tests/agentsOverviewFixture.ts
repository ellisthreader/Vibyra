import type { Teammate } from '../src/agents/types';
import type { ActivityFilters, ActivityItem } from '../src/agents/v2/activityModel';
import type { OverviewApi } from '../src/agents/v2/overviewApi';
import type { RosterRow } from '../src/agents/v2/overviewModel';
import { parsePlan } from '../src/agents/v2/planModel';
import { RunError } from '../src/agents/v2/runsApi';
import { parseTemplates } from '../src/agents/v2/templatesModel';

/**
 * Simulated Agent v2 Phase 8 service for `?v2&overview` fixtures: plan card, activity, roster +
 * read markers, uploads and starter teammates. The prompt chooses the plan so each state can be
 * reached by typing. No live backend, account or Mac; every call is recorded for the checks.
 */
const clone = <T,>(value: T): T => structuredClone(value);
const tool = (t: string, provider: string, connectionId: string, account: string, kind: 'read' | 'write') =>
  ({ tool: t, provider, connectionId, account, kind, requiresApproval: kind === 'write' });
const GMAIL = 'conn-gmail', WORK = 'work@acme.com';

export const fixturePlan = (prompt: string, query: URLSearchParams) => {
  const text = prompt.toLowerCase();
  const gmailTools = [tool('gmail_search', 'gmail', GMAIL, WORK, 'read'), tool('gmail_read', 'gmail', GMAIL, WORK, 'read'), tool('gmail_send', 'gmail', GMAIL, WORK, 'write')];
  const uses = text.includes('inbox') || text.includes('email') || text.includes('overflow');
  const tools = uses ? gmailTools : [];
  const missing: unknown[] = [];
  if (text.includes('github')) missing.push({ provider: 'github', name: 'GitHub', reason: 'not_connected', blocking: true, message: 'No GitHub account is connected.', connectionId: null, account: null,
    fix: { action: 'connect', method: 'POST', path: '/api/agents/v2/connections/github/start', message: 'Connect GitHub in Connections.' } });
  if (text.includes('calendar')) missing.push({ provider: 'google_calendar', name: 'Google Calendar', reason: 'not_granted', blocking: true, message: 'Code reviewer has no access to Google Calendar.',
    connectionId: 'conn-cal', account: 'me@acme.com', accounts: [{ connectionId: 'conn-cal', account: 'me@acme.com' }],
    fix: { action: 'grant', method: 'PUT', path: '/api/agents/v2/agents/review/grants/conn-cal', message: 'Choose what Code reviewer may do with me@acme.com.' } });
  if (text.includes('slack')) missing.push({ provider: 'slack', name: 'Slack', reason: 'unavailable', blocking: true, message: 'Slack sign-in is not configured.', connectionId: null, account: null, fix: null });
  if (text.includes('overflow')) missing.push({ provider: 'github', name: 'GitHub', reason: 'over_cap', blocking: false, message: 'Only 10 tools fit one task.', connectionId: 'conn-gh', account: 'octocat',
    fix: { action: 'mention', method: null, path: null, message: 'Name GitHub in the task, or remove access this teammate does not need.' } });
  const runtime = query.has('no-runtime')
    ? { ok: false, code: 'runtime_required', message: 'Teammates run on an AI account you choose on your Mac, and none is selected yet.',
      fix: { action: 'choose_ai_account', message: 'Open Vibyra on your Mac and choose a Claude Code account in Settings → AI accounts.' } }
    : { ok: true, provider: 'claude', model: 'sonnet' };
  return { agentId: 'review', fundingSource: 'connected_account', ready: runtime.ok && !missing.some((m: any) => m.blocking), maxTools: 10, runtime,
    services: uses ? [{ provider: 'gmail', name: 'Gmail', connectionId: GMAIL, account: WORK, score: 100, reads: ['gmail_search', 'gmail_read'], writes: ['gmail_send'] }] : [],
    tools, approvals: tools.filter(t => t.requiresApproval),
    dropped: text.includes('overflow') ? [tool('github_create_issue', 'github', 'conn-gh', 'octocat', 'write')] : [], mentioned: [], missing };
};

const item = (n: number, patch: Partial<ActivityItem>): ActivityItem => ({ id: `receipt-${n}`, actionId: `action-${n}`, runId: `run-${n}`, agentId: 'review', agentName: 'Code reviewer',
  tool: 'gmail_send', kind: 'write', provider: 'gmail', connectionId: GMAIL, accountLabel: WORK, status: 'confirmed', outcome: 'confirmed', actionState: 'completed',
  summary: 'Sent to team@example.com', url: 'https://mail.google.com/mail/u/0/#sent/abc', createdAt: new Date(Date.now() - n * 3600e3).toISOString(), ...patch });
const ACTIVITY: ActivityItem[] = [
  item(1, {}), item(2, { agentId: 'site', agentName: 'Website helper', tool: 'github_comment_issue', provider: 'github', accountLabel: 'octocat', summary: 'Commented on bakery/website#12', url: 'https://github.com/bakery/website/issues/12#issuecomment-1' }),
  item(3, { tool: 'gmail_search', kind: 'read', summary: 'Found 14 messages', url: null }),
  item(4, { agentId: 'site', agentName: 'Website helper', tool: 'github_create_issue', provider: 'github', accountLabel: 'octocat', status: 'failed', outcome: 'refused', summary: 'Repository not found', url: null }),
  item(5, { tool: 'slack_post_message', provider: 'slack', accountLabel: 'acme', status: 'unknown', outcome: 'outcome_unknown', summary: '<img src=x onerror=window.__xss=1>Posted <b>to #general</b>', url: 'javascript:window.__xss=1' }),
  item(6, { tool: 'google_calendar_create_event', provider: 'google_calendar', accountLabel: 'me@acme.com', summary: 'Created “Planning”', url: 'https://evil.example/phish' }),
  item(7, { tool: 'gmail_read', kind: 'read', summary: 'Read “Invoice 204”', url: null }),
];
const TEMPLATES = parseTemplates({ templates: [
  { key: 'inbox_triage', name: 'Inbox triage', avatar: 'assistant', brief: 'Read my new email and draft replies.', autoGrant: false, suggested: { schedule: null,
    providers: [{ provider: 'gmail', name: 'Gmail', why: 'Reads new mail; a reply is sent only after you approve it.', connected: true,
      operations: [{ tool: 'gmail_search', kind: 'read' }, { tool: 'gmail_read', kind: 'read' }, { tool: 'gmail_send', kind: 'write' }] }],
    trigger: { kind: 'gmail.message', filter: { query: 'is:unread -category:promotions', pollMinutes: 5 }, promptTemplate: 'A new email arrived. Tell me if it needs me.' } } },
  { key: 'pr_shepherd', name: 'PR shepherd', avatar: 'review', brief: 'Watch my pull requests.', autoGrant: false, suggested: { schedule: null,
    providers: [{ provider: 'github', name: 'GitHub', why: 'Reads pull requests; comments need your approval.', connected: false,
      operations: [{ tool: 'github_list_pull_requests', kind: 'read' }, { tool: 'github_comment_issue', kind: 'write' }] }],
    trigger: { kind: 'github.pull_request', filter: { actions: ['opened', 'ready_for_review'] }, promptTemplate: 'A pull request was opened. Summarize it.' } } },
  { key: 'morning_brief', name: 'Morning brief', avatar: 'lead', brief: 'Each morning, one short brief.', autoGrant: false, suggested: { trigger: null,
    providers: [{ provider: 'google_calendar', name: 'Google Calendar', why: 'Reads today’s meetings.', connected: false, operations: [{ tool: 'google_calendar_list_events', kind: 'read' }] },
      { provider: 'gmail', name: 'Gmail', why: 'Reads email that arrived overnight.', connected: true, operations: [{ tool: 'gmail_search', kind: 'read' }] }],
    schedule: { recurrence: { type: 'weekly', weekdays: [1, 2, 3, 4, 5], time: '08:00' }, prompt: 'Write my morning brief for today.' } } },
  { key: 'meeting_prep', name: 'Meeting prep', avatar: 'sprout', brief: 'Prepare me before each meeting.', autoGrant: false, suggested: { schedule: null,
    providers: [{ provider: 'google_calendar', name: 'Google Calendar', why: 'Finds the meeting.', connected: false, operations: [{ tool: 'google_calendar_list_events', kind: 'read' }] }],
    trigger: { kind: 'calendar.event_soon', filter: { calendarId: 'primary', leadMinutes: 30 }, promptTemplate: 'A meeting starts soon. Prepare me for it.' } } },
] });

export function fixtureOverview(calls: unknown[], query: URLSearchParams, hooks: { teammates(): Teammate[]; add(agent: Teammate): void }): OverviewApi {
  const cursors = new Map<string, string>(); const unread = new Map<string, boolean>([['site', true], ['review', true]]);
  let uploads = 0, staleOnce = query.has('stale-read'), interrupted = query.has('template-timeout');
  const created = new Map<string, Teammate>();
  const cursorOf = (id: string) => cursors.get(id) ?? (cursors.set(id, id.padEnd(64, 'a').slice(0, 64).replace(/[^a-f0-9]/g, 'a')), cursors.get(id)!);
  const rows = (): RosterRow[] => hooks.teammates().map(agent => {
    const waiting = agent.id === 'review', done = agent.id === 'site';
    const attention = waiting || done;
    return { agentId: agent.id, name: agent.name, archived: agent.archived, status: waiting ? 'waiting_for_approval' : done ? 'completed' : 'idle', waitingApprovalCount: waiting ? 1 : 0,
      lastRun: attention ? { id: `run-${agent.id}`, state: waiting ? 'waiting_for_approval' : 'completed', stateReason: null, terminal: done, conversationSeq: 1,
        preview: waiting ? 'Email the release notes to the team.' : 'Opening hours are updated on the site.', createdAt: '2026-09-30T09:00:00Z', finishedAt: null } : null,
      readCursor: attention ? cursorOf(agent.id) : null, unread: attention && (unread.get(agent.id) ?? false), updatedAt: '2026-09-30T09:00:00Z' };
  });
  return {
    plan: async (request, key) => {
      calls.push({ action: 'v2-plan', prompt: request.prompt, attachments: [...request.attachments], key });
      if (query.has('plan-fails')) throw new RunError('Plan unavailable.', 500, null);
      return parsePlan(fixturePlan(request.prompt, query))!;
    },
    activity: async (filters: ActivityFilters) => {
      calls.push({ action: 'v2-activity', filters: clone(filters) });
      const all = ACTIVITY.filter(i => (!filters.provider || i.provider === filters.provider) && (!filters.agentId || i.agentId === filters.agentId));
      const start = filters.cursor ? Number(filters.cursor.replace('page', '')) : 0;
      const items = all.slice(start, start + 3);
      return { items: clone(items), nextCursor: start + 3 < all.length ? `page${start + 3}` : null };
    },
    roster: async () => { calls.push({ action: 'v2-roster' }); return clone(rows()); },
    markRead: async (agentId, cursor) => {
      calls.push({ action: 'v2-read', agentId, cursor });
      if (staleOnce) { staleOnce = false; cursors.set(agentId, 'b'.repeat(64)); return 'stale'; }
      if (cursor !== cursorOf(agentId)) return 'stale';
      unread.set(agentId, false); return 'ok';
    },
    upload: async source => {
      const n = ++uploads; calls.push({ action: 'v2-upload', name: source.name, mimeType: source.mimeType });
      return { id: `att-${n}`, kind: source.mimeType.startsWith('image/') ? 'image' : source.mimeType === 'application/pdf' ? 'pdf' : 'text', name: source.name, bytes: 120 };
    },
    templates: async () => { calls.push({ action: 'v2-templates' }); return clone(TEMPLATES); },
    fromTemplate: async (key, id, name) => {
      calls.push({ action: 'v2-template-create', key, id, name: name ?? null });
      let agent = created.get(id);
      // Idempotent on the id, like the server: a retried create returns the same teammate.
      if (!agent) {
        const t = TEMPLATES.find(x => x.key === key)!;
        agent = { id, chatId: `chat-${id}`, name: t.name, avatar: t.avatar as Teammate['avatar'], brief: t.brief, memory: '', integrations: [], budget: 10,
          revision: 1, archived: false, status: 'idle', lastMessage: '', updatedAt: new Date().toISOString(), lastRunId: null } as Teammate;
        created.set(id, agent); hooks.add(agent);
      }
      if (interrupted) { interrupted = false; throw new RunError('Connection interrupted.', 0, null); }
      return clone(agent);
    },
  };
}
