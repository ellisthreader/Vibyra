import { useEffect, useState } from 'react';
import { formatLocal, todayIn, type Schedule } from '../../../../mobile/src/agents/v2/routinesModel.ts';
import type { Run } from '../../../../mobile/src/agents/v2/runCore.ts';
import { message, teammateApi } from './api';
import { routinesClient } from './routinesClient';
import type { Teammate, Turn } from './types';

/** One past or current task, as the Overview and Runs tabs list it. */
export interface RunRow { id: string; prompt: string; state: string; createdAt: string }

export interface TeammateOverview { runs: RunRow[]; next: string | null; scheduled: boolean; ready: boolean; error: string }

const routines = routinesClient(teammateApi);

/** The earliest upcoming run of this teammate's active schedules, in its own zone. */
function nextRun(schedules: Schedule[]): string | null {
  const upcoming = schedules.filter(s => !s.paused && s.nextRunLocal && s.nextRunAt)
    .sort((a, b) => Date.parse(a.nextRunAt!) - Date.parse(b.nextRunAt!))[0];
  return upcoming ? formatLocal(upcoming.nextRunLocal, todayIn(upcoming.timezone)) || null : null;
}

async function load(agent: Teammate, v2: boolean): Promise<Omit<TeammateOverview, 'ready' | 'error'>> {
  if (!v2) {
    const page = await teammateApi<{ turns: Turn[] }>(`vibes/chats/${agent.chatId}/turns`);
    const turns = Array.isArray(page?.turns) ? page.turns : [];
    return { runs: turns.map(t => ({ id: t.id, prompt: t.prompt, state: t.status, createdAt: t.createdAt })).reverse(), next: null, scheduled: false };
  }
  const [data, schedules] = await Promise.all([
    teammateApi<{ runs: Run[] }>(`agents/v2/runs?agentId=${agent.id}&limit=20`),
    routines.capabilities().then(c => c.routines ? routines.schedules(agent.id) : []).catch(() => [] as Schedule[]),
  ]);
  const runs = Array.isArray(data?.runs) ? data.runs : [];
  return { runs: runs.map(r => ({ id: r.id, prompt: r.prompt, state: r.state, createdAt: r.createdAt })),
    next: nextRun(schedules), scheduled: schedules.some(s => !s.paused) };
}

/** Real figures for a teammate's Overview: its tasks, newest first, and when a
 * schedule runs it next. Re-read every 30 seconds while the page is open. */
export function useTeammateOverview(agent: Teammate, v2: boolean, active: boolean): TeammateOverview {
  const [state, setState] = useState<TeammateOverview>({ runs: [], next: null, scheduled: false, ready: false, error: '' });
  useEffect(() => {
    if (!active) return;
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const result = await load(agent, v2); if (!stopped) setState({ ...result, ready: true, error: '' }); }
      catch (error) { if (!stopped) setState(old => ({ ...old, ready: true, error: message(error) })); }
      if (!stopped) timer = setTimeout(poll, 30000);
    };
    void poll(); return () => { stopped = true; clearTimeout(timer); };
  }, [agent.id, agent.chatId, agent.revision, v2, active]);
  return state;
}
