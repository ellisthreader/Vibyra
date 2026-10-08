import { VibesError } from '../../vibes/api';
import type { VibesApi, VibesTurn } from '../../vibes/types';
import type { Teammate } from '../types';
import {
  applyEvents, emptyFeed, parseRunBody, pollDelay, runBody, runToTurn, submitRun,
  type Run, type RunBody, type RunFeed,
} from './runCore';
import { RunError, type RunsApi } from './runsApi';
import type { OverviewApi } from './overviewApi';

interface SendRecord { key: string; body: string; runId?: string }
export interface Persisted { read(): Promise<string | null>; write(value: string): Promise<void> }
export type RunChatApi = VibesApi & { owns(id: string): boolean; nextDelay(): number };

const status = (e: unknown) => (e instanceof VibesError && e.status ? e.status : null);
const records = (raw: string | null): SendRecord[] => {
  try {
    const list = JSON.parse(raw ?? '[]');
    return Array.isArray(list) ? list.filter(r => r && typeof r.key === 'string' && parseRunBody(r.body, r.key)) : [];
  } catch { return []; }
};

/**
 * The teammate conversation on the v2 run API, behind the same VibesApi the
 * transcript already draws. The "quote" is the exact admission body; Send keeps
 * its key and body on the device before the network write and replays them
 * unchanged until the server answers.
 */
/** A refusal that carries the server's own fix (no AI account chosen yet) says that, in its words. */
const refusal = (error: unknown) => error instanceof RunError && error.fix?.message ? error.fix.message
  : error instanceof Error ? error.message : 'This task was not accepted.';

export function runChatApi(base: VibesApi, runs: RunsApi, teammate: Teammate, saved: Persisted, overview?: Pick<OverviewApi, 'upload'>): RunChatApi {
  const feeds = new Map<string, RunFeed>();
  const known = new Map<string, Run>();
  const actions = new Set<string>();
  let pending: SendRecord[] | null = null;
  let delay = 5000;
  const load = async () => (pending ??= records(await saved.read().catch(() => null)));
  const persist = async () => saved.write(JSON.stringify(pending ?? []));
  const remember = (run: Run) => {
    known.set(run.id, run);
    run.actions?.forEach(a => actions.add(a.id));
  };
  /** Drains the journal from the saved cursor; terminal runs read their persisted answer instead. */
  const follow = async (run: Run) => {
    remember(run);
    if (run.terminal) return;
    let feed = feeds.get(run.id) ?? emptyFeed();
    for (let page = 0; page < 5; page++) {
      const result = await runs.events(run.id, feed.cursor);
      const next = applyEvents(feed, result.events);
      const moved = next.cursor !== feed.cursor;
      feed = next;
      if (!moved || feed.cursor >= result.latestSeq) break;
    }
    feeds.set(run.id, feed);
  };
  const turn = (run: Run): VibesTurn => {
    const t = runToTurn(run, feeds.get(run.id));
    return { ...t, error: t.notice, tools: t.tools };
  };
  const settle = async (record: SendRecord, run: Run) => {
    const list = await load();
    pending = run.terminal ? list.filter(r => r.key !== record.key) : list.map(r => (r.key === record.key ? { ...r, runId: run.id } : r));
    await persist();
  };
  const deps = { admit: runs.admit, list: runs.list, status };
  /** Resolves a send key to its run: known id, else an identical replay of the saved body. */
  const resolve = async (record: SendRecord): Promise<Run> => {
    if (record.runId) return runs.run(record.runId);
    const body = parseRunBody(record.body, record.key) as RunBody;
    try {
      return await submitRun(body, deps, () => {
        pending = (pending ?? []).filter(r => r.key !== record.key);
        void persist();
      });
    } catch (error) {
      if (!(pending ?? []).some(r => r.key === record.key)) throw new VibesError(refusal(error), 404);
      throw error;
    }
  };
  return {
    ...base,
    owns: id => known.has(id) || actions.has(id) || Boolean(pending?.some(r => r.key === id)),
    nextDelay: () => delay,
    prepareAuto: undefined,
    autoPreparation: undefined,
    // Photos, PDFs and text go to the v2 store; the run names them by id. No Vibes are involved.
    upload: overview ? source => overview.upload(source) : undefined,
    quote: async (chatId, text, model, _effort, _integrations, attachments) => {
      if (chatId !== teammate.chatId) throw new Error('This conversation belongs to another teammate.');
      if (attachments?.length && !overview) throw new Error('Attachments aren’t available for this task. Remove them to send.');
      const { attachments: refs } = runBody(teammate.id, 'quote', text, attachments ?? []);
      return { quote: JSON.stringify({ agentId: teammate.id, prompt: text, attachments: refs }), model,
        maxCredits: 0, estimatedCredits: 0, fundingSource: 'connected_account', expiresAt: Date.now() / 1000 + 600 };
    },
    submit: async (key, quote) => {
      const body = JSON.stringify({ ...JSON.parse(quote), idempotencyKey: key });
      if (!parseRunBody(body, key)) throw new VibesError('This message could not be prepared. Edit it and try again.', 422);
      const record = { key, body };
      pending = [...(await load()).filter(r => r.key !== key), record];
      await persist();
      let run: Run;
      try { run = await resolve(record); } catch (error) {
        // A 4xx whose absence could not be confirmed stays pending for an identical retry.
        const code = status(error);
        if (code && code >= 400 && code < 500 && code !== 404 && (pending ?? []).some(r => r.key === key))
          throw new VibesError(error instanceof Error ? error.message : 'Check this send before retrying.', 0);
        throw error;
      }
      await settle(record, run);
      await follow(run);
      return turn(run);
    },
    turn: async id => {
      const record = (await load()).find(r => r.key === id);
      if (!record && !known.has(id)) return base.turn(id);
      const run = record ? await resolve(record) : await runs.run(id);
      if (record) await settle(record, run);
      await follow(run);
      return turn(run);
    },
    turns: async chatId => {
      const [legacy, list] = await Promise.all([base.turns(chatId), runs.list(teammate.id)]);
      const mine = list.filter(r => r.conversationId === chatId).reverse();
      for (const run of mine) await follow(run);
      const saved = await load();
      for (const record of saved.filter(r => !r.runId)) {
        const run = mine.find(r => r.idempotencyKey === record.key);
        if (run) await settle(record, run);
      }
      delay = pollDelay(mine.filter(r => !r.terminal).map(r => r.state));
      return [...legacy, ...mine.map(turn)].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    },
    cancel: async id => {
      const record = (await load()).find(r => r.key === id);
      if (!record && !known.has(id)) return base.cancel(id);
      const target = record ? (await resolve(record)).id : id;
      remember(await runs.cancel(target));
    },
  };
}
