import {
  applyEvents, emptyFeed, modeFromProbe, parseRunBody, pollDelay, runBody, runToTurn, submitRun,
  type EventsPage, type Run, type RunFeed,
} from '../../../../mobile/src/agents/v2/runCore.ts';
import type { Pending } from './threadStorage.ts';
import type { Tool, Turn } from './types.ts';
import { reviewedApproval } from '../../../../mobile/src/agents/approvalReview.ts';

/** The account bridge (`teammateApi`), injected so node tests exercise the real requests. */
export type Request = <T>(path: string, body?: unknown) => Promise<T>;
/** The bridge reports refusals as "409: words"; anything else is an uncertain transport failure. */
export function statusOf(error: unknown): number | null {
  const match = /^(\d{3}):/.exec(error instanceof Error ? error.message : String(error));
  return match ? Number(match[1]) : null;
}
export async function probeRuns(api: Request) {
  try { await api('agents/v2/runtimes'); return modeFromProbe(200); }
  catch (error) { return modeFromProbe(statusOf(error)); }
}
const runsClient = (api: Request) => ({
  admit: async (body: unknown) => (await api<{ run: Run }>('agents/v2/runs', body)).run,
  list: async (agentId: string) => {
    const data = await api<{ runs: Run[] }>(`agents/v2/runs?agentId=${agentId}&limit=20`);
    if (!Array.isArray(data?.runs)) throw new Error('The service returned an invalid task list. Try refreshing.');
    return data.runs;
  },
  run: async (id: string) => (await api<{ run: Run }>(`agents/v2/runs/${id}`)).run,
  events: (id: string, after: number) => api<EventsPage>(`agents/v2/runs/${id}/events?after=${after}&limit=200`),
  cancel: (id: string) => api(`agents/v2/runs/${id}/cancel`, {}),
  decide: (id: string, fingerprint: string, decision: 'allow' | 'decline') =>
    api(`agents/v2/actions/${id}/decision`, { fingerprint, decision }),
});

/** The exact admission body is the pending "quote", saved before the first send. */
export function runPending(agentId: string, text: string, uuid: () => string = () => crypto.randomUUID(), attachments: string[] = [], runtimeId?: string, executionMode?: 'independent' | 'ordered'): Pending {
  const id = uuid();
  return { id, quote: JSON.stringify(runBody(agentId, id, text, attachments, runtimeId, executionMode)), text };
}
export const isRunPending = (pending: Pending) => Boolean(parseRunBody(pending.quote, pending.id));
export function submitRunPending(api: Request, pending: Pending, released: () => void): Promise<Run> {
  const body = parseRunBody(pending.quote, pending.id);
  if (!body) return Promise.reject(new Error('The saved send could not be restored. Reopen the app before sending again.'));
  const client = runsClient(api);
  return submitRun(body, { admit: client.admit, list: client.list, status: statusOf, lookup:body.executionMode==='independent'?async(agent,key)=>(await api<{runs:Run[]}>(`agents/v2/jobs?agentId=${encodeURIComponent(agent)}&idempotencyKey=${encodeURIComponent(key)}`)).runs:undefined }, released);
}

export function runTurn(run: Run, feed?: RunFeed): Turn {
  const turn = runToTurn(run, feed);
  const tools: Tool[] = turn.tools.map(t => ({ id: t.id, operation: t.operation, integration: t.integration, account: t.account ?? undefined, connectionId: t.connectionId ?? undefined, v2: true,
    summary: t.summary ?? undefined, expiresAt: t.expiresAt, approval: t.approval ?? undefined }));
  return { ...turn, tools };
}

/** Replays each live run's journal from its cursor; terminal runs show their saved answer. */
async function followRun(api: Request, run: Run, feeds: Map<string, RunFeed>) {
  if (run.terminal) return;
  let feed = feeds.get(run.id) ?? emptyFeed();
  for (let page = 0; page < 5; page++) {
    const result = await runsClient(api).events(run.id, feed.cursor);
    const next = applyEvents(feed, Array.isArray(result?.events) ? result.events : []);
    const moved = next.cursor !== feed.cursor;
    feed = next;
    if (!moved || feed.cursor >= result.latestSeq) break;
  }
  feeds.set(run.id, feed);
}

export async function loadRunTurns(api: Request, agentId: string, chatId: string, feeds: Map<string, RunFeed>, requestedRunId?: string) {
  const runs = (await runsClient(api).list(agentId)).filter(r => r.conversationId === chatId).reverse();
  // A notification may refer to a task older than the newest twenty. Fetch that
  // owned task explicitly instead of silently opening an unrelated latest turn.
  if (requestedRunId && !runs.some(run => run.id === requestedRunId)) {
    const requested = await runsClient(api).run(requestedRunId);
    if (requested.id !== requestedRunId || requested.agentId !== agentId || requested.conversationId !== chatId)
      throw new Error('This task is not available in this conversation.');
    runs.push(requested);
    runs.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }
  await Promise.all(runs.map(run => followRun(api, run, feeds)));
  return { turns: runs.map(run => runTurn(run, feeds.get(run.id))), delay: pollDelay(runs.filter(r => !r.terminal).map(r => r.state)) };
}

/** Re-reads the run, then decides only if the same fingerprint is still pending and unexpired. */
export async function decideRun(api: Request, turn: Turn, tool: Tool, decision: 'allow' | 'decline', sending: () => void = () => {}) {
  const client = runsClient(api);
  const latest = runTurn(await client.run(turn.id));
  const current = reviewedApproval(turn, tool, latest);
  sending();
  await client.decide(tool.id, current!.approval!.fingerprint, decision);
}

export const mergeTurns = (legacy: Turn[], runs: Turn[]) =>
  [...legacy, ...runs].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
