import {
  NO_CAPABILITIES, parseCapabilities, type Capabilities, type Occurrence, type Preview, type Recurrence, type Schedule, type ScheduleBody,
} from '../../../../mobile/src/agents/v2/routinesModel.ts';
import type { Connection, Trigger, TriggerEvent, Webhook } from '../../../../mobile/src/agents/v2/triggersModel.ts';

/** The account bridge (`teammateApi`), injected so node tests exercise the real requests. */
export type RoutineRequest = <T>(path: string, body?: unknown, method?: 'PATCH' | 'DELETE') => Promise<T>;

/** The bridge reports refusals as "409: words"; the routines UI shows only the words. */
export const words = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/^\d{3}:\s*/, '');

const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? value : []);
function one<T extends { id: string }>(value: T | undefined, what: string): T {
  if (!value || typeof value.id !== 'string') throw new Error(`The service returned an invalid ${what}. Try refreshing.`);
  return value;
}

/** Agent V2 routines and triggers on the Mac (docs/agent-v2-api-contract.md §6b). */
export const routinesClient = (api: RoutineRequest) => ({
  /** Any failure reports everything off, so no routine or trigger controls appear. */
  capabilities: async (): Promise<Capabilities> => {
    try { return parseCapabilities(await api('agents/v2/capabilities')); } catch { return NO_CAPABILITIES; }
  },
  preview: async (timezone: string, recurrence: Recurrence): Promise<Preview> => {
    const data = await api<{ description?: string; next?: Preview['next'] }>('agents/v2/schedules/preview', { timezone, recurrence, count: 3 });
    return { description: String(data?.description ?? ''), next: list(data?.next) };
  },
  schedules: async (agentId: string) => list<Schedule>((await api<{ schedules: Schedule[] }>(`agents/v2/schedules?agentId=${agentId}`))?.schedules),
  createSchedule: async (body: ScheduleBody) => one((await api<{ schedule: Schedule }>('agents/v2/schedules', body))?.schedule, 'routine'),
  pauseSchedule: async (id: string, paused: boolean) =>
    one((await api<{ schedule: Schedule }>(`agents/v2/schedules/${id}/pause`, { paused }))?.schedule, 'routine'),
  deleteSchedule: async (id: string) => { await api(`agents/v2/schedules/${id}`, undefined, 'DELETE'); },
  occurrences: async (id: string) =>
    list<Occurrence>((await api<{ occurrences: Occurrence[] }>(`agents/v2/schedules/${id}/occurrences?limit=20`))?.occurrences),
  triggers: async (agentId: string) => list<Trigger>((await api<{ triggers: Trigger[] }>(`agents/v2/triggers?agentId=${agentId}`))?.triggers),
  createTrigger: async (body: unknown) => {
    const data = await api<{ trigger: Trigger; webhook: Webhook | null }>('agents/v2/triggers', body);
    return { trigger: one(data?.trigger, 'trigger'), webhook: data?.webhook ?? null };
  },
  /** Stripe's endpoint signing secret, pasted after the endpoint exists; the hook stays off until then. */
  saveSigningSecret: async (trigger: Pick<Trigger, 'id' | 'revision'>, signingSecret: string) =>
    one((await api<{ trigger: Trigger }>(`agents/v2/triggers/${trigger.id}`, { revision: trigger.revision, signingSecret }, 'PATCH'))?.trigger, 'trigger'),
  pauseTrigger: async (id: string, paused: boolean) =>
    one((await api<{ trigger: Trigger }>(`agents/v2/triggers/${id}/pause`, { paused }))?.trigger, 'trigger'),
  deleteTrigger: async (id: string) => { await api(`agents/v2/triggers/${id}`, undefined, 'DELETE'); },
  events: async (id: string) => list<TriggerEvent>((await api<{ events: TriggerEvent[] }>(`agents/v2/triggers/${id}/events?limit=20`))?.events),
  connections: async () => list<Connection>((await api<{ connections: Connection[] }>('agents/v2/connections'))?.connections),
});
export type RoutinesClient = ReturnType<typeof routinesClient>;
