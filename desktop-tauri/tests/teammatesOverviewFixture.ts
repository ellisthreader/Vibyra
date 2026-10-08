/**
 * Simulated Agent v2 Phase 8 service for the Mac teammates fixture (`?v2`): task plan, activity, roster + read
 * markers, attachments and starter teammates. No live account or provider; every call is recorded.
 */
const STALE = '409: This conversation changed. Refresh before marking it read.\u001e{"code":"stale_cursor","fix":null}';
const RUNTIME_FIX = 'Open Vibyra on your Mac and choose a Claude Code account in Settings → AI accounts.';
const REFUSED = `409: Teammates run on an AI account you choose on your Mac, and none is selected yet.\u001e${JSON.stringify({ code: 'runtime_required', fix: { action: 'choose_ai_account', message: RUNTIME_FIX } })}`;

const op = (tool: string, kind: 'read' | 'write') => ({ tool, kind });
const templates = [
  { key: 'inbox_triage', name: 'Inbox triage', avatar: 'assistant', brief: 'Read my new email and draft short replies. Never send without approval.',
    suggested: { providers: [{ provider: 'gmail', name: 'Gmail', operations: [op('gmail_search', 'read'), op('gmail_read', 'read'), op('gmail_send', 'write')], why: 'Reads new mail; a reply is sent only after you approve it.', connected: true }],
      schedule: null, trigger: { kind: 'gmail.message', filter: { query: 'is:unread -category:promotions', pollMinutes: 5 }, promptTemplate: 'A new email arrived. Tell me if it needs me and draft a reply if it does.' } }, autoGrant: false },
  { key: 'pr_shepherd', name: 'PR shepherd', avatar: 'review', brief: 'Watch my GitHub pull requests and summarize what changed.',
    suggested: { providers: [{ provider: 'github', name: 'GitHub', operations: [op('github_list_issues', 'read'), op('github_comment_issue', 'write')], why: 'Reads pull requests; comments need your approval.', connected: false }],
      schedule: null, trigger: { kind: 'github.pull_request', filter: { actions: ['opened', 'ready_for_review'] }, promptTemplate: 'A pull request was opened. Summarize it and list anything blocking review.' } }, autoGrant: false },
  { key: 'morning_brief', name: 'Morning brief', avatar: 'lead', brief: 'Each morning, give me one short brief. Read only.',
    suggested: { providers: [{ provider: 'gmail', name: 'Gmail', operations: [op('gmail_search', 'read'), op('gmail_read', 'read')], why: 'Reads email that arrived overnight.', connected: true }],
      schedule: { recurrence: { type: 'weekly', weekdays: [1, 2, 3, 4, 5], time: '08:00' }, prompt: 'Write my morning brief for today.' }, trigger: null }, autoGrant: false },
  { key: 'meeting_prep', name: 'Meeting prep', avatar: 'sprout', brief: 'Before each meeting, give me a short prep note.',
    suggested: { providers: [{ provider: 'gmail', name: 'Gmail', operations: [op('gmail_search', 'read')], why: 'Finds related threads.', connected: true }], schedule: null,
      trigger: { kind: 'calendar.event_soon', filter: { calendarId: 'primary', leadMinutes: 30 }, promptTemplate: 'A meeting starts soon. Prepare me for it.' } }, autoGrant: false },
];

export function overviewFixture(uid: (n: number) => string, hooks: { addAgent(agent: any): void }) {
  const state = { calls: [] as { path: string; body: any; device?: string }[], reads: [] as any[], previews: [] as any[], uploads: [] as any[], created: [] as any[],
    status: 'waiting_for_approval', staleReads: 0, failCreateOnce: false, createAttempts: [] as { key: string; id: string }[], opened: [] as string[], refuseAdmit: false, rosterFails: false, currentCursor: 'd'.repeat(64), unread: true, activityPages: [] as string[] };
  const agent1 = uid(1), agent2 = uid(2);
  const at = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
  const kinds = [['gmail', 'gmail_send', 'write', 'Sent to team@example.com', 'team@example.com', null], ['github', 'github_create_issue', 'write', 'Created acme/site#41', 'octocat', 'https://github.com/acme/site/issues/41'],
    ['gmail', 'gmail_search', 'read', 'Found 3 messages', 'team@example.com', null], ['github', 'github_list_issues', 'read', 'Listed 12 issues', 'octocat', 'https://evil.example.com/phish']] as const;
  const feed = Array.from({ length: 45 }, (_, i) => {
    const [provider, tool, kind, summary, account, url] = kinds[i % 4]!;
    const hostile = i === 6;
    return { id: `receipt-${i + 1}`, actionId: `act-${i + 1}`, runId: `v2-run-${i + 1}`, agentId: i % 3 === 0 ? agent2 : agent1, agentName: i % 3 === 0 ? 'On-call engineer' : 'Website reviewer',
      tool, kind, provider, connectionId: `conn-${provider}`, accountLabel: account, status: i === 2 ? 'failed' : 'confirmed', outcome: i === 2 ? 'rate_limited' : i === 4 ? 'outcome_unknown' : 'confirmed',
      actionState: 'completed', summary: hostile ? '<img src=x onerror="window.__xss=1"> Posted to #general' : summary, providerResourceId: null,
      url: hostile ? 'javascript:window.__xss=1' : url, createdAt: at(i * 37 + 1), updatedAt: null };
  });
  const plan = (body: any) => {
    const prompt = String(body.prompt), bad = /github issue/i.test(prompt), noRuntime = /no ai account/i.test(prompt), noAccess = /no access/i.test(prompt);
    const gmail = { provider: 'gmail', connectionId: 'conn-gmail', account: 'team@example.com' };
    return { agentId: body.agentId, fundingSource: 'connected_account', ready: !bad && !noRuntime && !noAccess, maxTools: 10,
      runtime: noRuntime ? { ok: false, code: 'runtime_required', message: 'Teammates run on an AI account you choose on your Mac, and none is selected yet.', fix: { action: 'choose_ai_account', method: null, path: null, message: RUNTIME_FIX } } : { ok: true, id: 'rt-1', provider: 'claude', model: 'sonnet' },
      services: [{ ...gmail, name: 'Gmail', score: 100, reads: ['gmail_search', 'gmail_read'], writes: ['gmail_send'] }],
      tools: [{ ...gmail, tool: 'gmail_search', kind: 'read', requiresApproval: false }, { ...gmail, tool: 'gmail_send', kind: 'write', requiresApproval: true }],
      approvals: [{ ...gmail, tool: 'gmail_send', kind: 'write', requiresApproval: true }],
      dropped: [{ provider: 'github', connectionId: 'conn-github', account: 'octocat', tool: 'github_create_issue', kind: 'write', requiresApproval: true }],
      mentioned: bad ? ['gmail', 'github'] : ['gmail'],
      missing: noAccess ? [{ provider: 'gmail', name: 'Gmail', reason: 'not_granted', blocking: true, message: 'Website reviewer has no access to Gmail.', connectionId: 'conn-gmail', account: 'team@example.com',
        accounts: [{ connectionId: 'conn-gmail', account: 'team@example.com' }], fix: { action: 'grant', method: 'PUT', path: '/api/agents/v2/agents/x/grants/conn-gmail', message: 'Choose what Website reviewer may do with team@example.com.' } }]
        : bad ? [{ provider: 'github', name: 'GitHub', reason: 'not_connected', blocking: true, message: 'No GitHub account is connected.', connectionId: null, account: null,
        fix: { action: 'connect', method: 'POST', path: '/api/agents/v2/connections/github/start', message: 'Connect GitHub in Connections.' } }]
        : [{ provider: 'github', name: 'GitHub', reason: 'over_cap', blocking: false, message: 'Only 10 tools fit one task.', connectionId: 'conn-github', account: 'octocat',
          fix: { action: 'mention', method: null, path: null, message: 'Name GitHub in the task, or remove access this teammate does not need.' } }] };
  };
  const row = () => ({ agentId: agent1, name: 'Website reviewer', avatar: 'site', brief: '', archived: false, status: state.status, waitingApprovalCount: state.status === 'waiting_for_approval' ? 1 : 0,
    lastRun: { id: 'v2-run-1', state: state.status, stateReason: null, terminal: state.status === 'completed', conversationSeq: 1, preview: 'Email the release notes to the team.', createdAt: '2026-09-30T09:00:00Z', finishedAt: null },
    readCursor: state.currentCursor, unread: state.unread, fundingSource: 'connected_account', updatedAt: '2026-09-30T09:00:00Z' });
  const request = (path: string, body: any, device?: string): unknown => {
    if (!path.startsWith('agents/v2/')) return undefined;
    const rest = path.slice('agents/v2/'.length);
    if (rest === 'roster') { state.calls.push({ path, body, device }); if (state.rosterFails) throw '503: Roster unavailable.'; return { teammates: [row()] }; }
    const read = /^agents\/([^/]+)\/read$/.exec(rest);
    if (read) {
      state.calls.push({ path, body, device }); state.reads.push({ agent: read[1], cursor: body.cursor, device });
      if (state.staleReads > 0) { state.staleReads--; state.currentCursor = 'e'.repeat(64); throw STALE; }
      if (body.cursor !== state.currentCursor) throw STALE;
      state.unread = false; return { ok: true };
    }
    if (rest === 'runs' && body && state.refuseAdmit) { state.refuseAdmit = false; throw REFUSED; }
    if (rest === 'runs/preview') {
      state.previews.push(structuredClone(body));
      if (/plan error/i.test(String(body.prompt))) throw '503: The plan service is unavailable.';
      return { plan: plan(body) };
    }
    if (rest === 'templates') return { templates: structuredClone(templates) };
    const create = /^templates\/([a-z_]+)\/teammates$/.exec(rest);
    if (create && body) {
      const t = templates.find(x => x.key === create[1]); if (!t) throw '404: That starter teammate does not exist.';
      state.createAttempts.push({ key: t.key, id: body.id });
      if (state.failCreateOnce) { state.failCreateOnce = false; throw 'Connection interrupted. Refresh to check the outcome.'; }
      if (state.created.some(c => c.id === body.id)) return { teammate: state.created.find(c => c.id === body.id)!.teammate, template: t };
      const teammate = { id: body.id, chatId: uid(60 + state.created.length), revision: 1, name: body.name ?? t.name, brief: t.brief, memory: '', avatar: t.avatar, budget: 10, integrations: [], archived: false,
        status: 'idle', lastMessage: '', updatedAt: new Date().toISOString(), lastRunId: null };
      state.created.push({ key: t.key, id: body.id, teammate }); hooks.addAgent(teammate); return { teammate, template: t };
    }
    if (rest.startsWith('activity?')) {
      state.calls.push({ path, body }); state.activityPages.push(rest);
      const q = new URLSearchParams(rest.slice('activity?'.length)), limit = Number(q.get('limit')), offset = q.get('cursor') === 'PAGE2' ? 30 : 0;
      const all = feed.filter(i => (!q.get('provider') || i.provider === q.get('provider')) && (!q.get('agentId') || i.agentId === q.get('agentId')));
      const items = all.slice(offset, offset + limit);
      return { items, nextCursor: offset + limit < all.length ? 'PAGE2' : null };
    }
    return undefined;
  };
  return { state, request, templates, agent2 };
}
