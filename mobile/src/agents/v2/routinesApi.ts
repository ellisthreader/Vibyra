import { apiUrl, requestJson } from '../../transport/requestJson';
import { RunError } from './runsApi';
import {
  NO_CAPABILITIES, parseCapabilities, type Capabilities, type Occurrence, type Preview, type Recurrence, type Schedule, type ScheduleBody,
} from './routinesModel';
import type { Connection, Trigger, TriggerEvent, Webhook } from './triggersModel';

export type { Occurrence, Recurrence, Schedule, ScheduleBody } from './routinesModel';

/**
 * Agent V2 routines (schedules) and triggers client: docs/agent-v2-api-contract.md §6b.
 * `capabilities` never fails closed into v2: any error reports everything off, so the
 * setup keeps today's "Draft · not running yet" routines.
 */
export function createRoutinesApi(baseUrl: string, token: () => string | null, fetcher: typeof fetch = fetch) {
  const call = async (method: string, path: string, body?: unknown) => {
    const identity = token();
    if (!identity) throw new RunError('Sign in to manage routines.', 401, null);
    let result;
    try {
      result = await requestJson(fetcher, apiUrl(baseUrl, `agents/v2/${path}`), {
        method,
        headers: { Authorization: `Bearer ${identity}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }, 25000);
    } catch {
      throw new RunError('Connection interrupted. Try again.', 0, null);
    }
    const { response, data } = result;
    if (identity !== token()) throw new RunError('Your account changed. Refresh to continue.', 401, null);
    if (!response.ok) {
      const field = data.errors && typeof data.errors === 'object' ? Object.values(data.errors as Record<string, string[]>)[0]?.[0] : undefined;
      throw new RunError(data.error ?? field ?? data.message ?? 'Routines could not be reached.', response.status,
        typeof data.code === 'string' ? data.code : null);
    }
    return data;
  };
  const id = encodeURIComponent;
  const schedule = (data: any): Schedule => {
    if (!data?.schedule || typeof data.schedule.id !== 'string') throw new RunError('This server returned an unsupported routine.', 502, null);
    return data.schedule;
  };
  const trigger = (data: any): Trigger => {
    if (!data?.trigger || typeof data.trigger.id !== 'string') throw new RunError('This server returned an unsupported trigger.', 502, null);
    return data.trigger;
  };
  const listOf = <T,>(value: unknown): T[] => (Array.isArray(value) ? value : []);
  return {
    capabilities: async (): Promise<Capabilities> => {
      try { return parseCapabilities(await call('GET', 'capabilities')); } catch { return NO_CAPABILITIES; }
    },
    preview: async (timezone: string, recurrence: Recurrence): Promise<Preview> => {
      const data = await call('POST', 'schedules/preview', { timezone, recurrence, count: 3 });
      return { description: String(data.description ?? ''), next: listOf(data.next) };
    },
    list: async (agentId: string): Promise<Schedule[]> => listOf((await call('GET', `schedules?agentId=${id(agentId)}`)).schedules),
    create: async (body: ScheduleBody): Promise<Schedule> => schedule(await call('POST', 'schedules', body)),
    pause: async (scheduleId: string, paused: boolean): Promise<Schedule> =>
      schedule(await call('POST', `schedules/${id(scheduleId)}/pause`, { paused })),
    remove: async (scheduleId: string): Promise<void> => { await call('DELETE', `schedules/${id(scheduleId)}`); },
    history: async (scheduleId: string): Promise<Occurrence[]> =>
      listOf((await call('GET', `schedules/${id(scheduleId)}/occurrences?limit=20`)).occurrences),
    triggers: {
      list: async (agentId: string): Promise<Trigger[]> => listOf((await call('GET', `triggers?agentId=${id(agentId)}`)).triggers),
      create: async (body: unknown): Promise<{ trigger: Trigger; webhook: Webhook | null }> => {
        const data = await call('POST', 'triggers', body);
        return { trigger: trigger(data), webhook: data.webhook ?? null };
      },
      update: async (triggerId: string, body: { revision: number } & Record<string, unknown>): Promise<Trigger> =>
        trigger(await call('PATCH', `triggers/${id(triggerId)}`, body)),
      pause: async (triggerId: string, paused: boolean): Promise<Trigger> =>
        trigger(await call('POST', `triggers/${id(triggerId)}/pause`, { paused })),
      remove: async (triggerId: string): Promise<void> => { await call('DELETE', `triggers/${id(triggerId)}`); },
      events: async (triggerId: string): Promise<TriggerEvent[]> =>
        listOf((await call('GET', `triggers/${id(triggerId)}/events?limit=20`)).events),
    },
    connections: async (): Promise<Connection[]> => listOf((await call('GET', 'connections')).connections),
  };
}
export type RoutinesApi = ReturnType<typeof createRoutinesApi>;
