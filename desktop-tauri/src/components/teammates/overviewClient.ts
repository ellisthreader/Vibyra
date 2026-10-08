import { activityPath, parseActivity, type ActivityFilters, type ActivityPage } from '../../../../mobile/src/agents/v2/activityModel.ts';
import { isStaleCursor, parseRoster, type RosterRow } from '../../../../mobile/src/agents/v2/overviewModel.ts';
import { parsePlan, planBody, previewKeyFor, type PlanRequest, type TaskPlan } from '../../../../mobile/src/agents/v2/planModel.ts';
import { parseTemplates, type Template } from '../../../../mobile/src/agents/v2/templatesModel.ts';
import { codeOf } from './bridgeError.ts';
import { statusOf, type Request } from './runsV2.ts';
import type { Teammate } from './types.ts';

const bad = (what: string): never => { throw new Error(`The service returned an invalid ${what}. Try refreshing.`); };

/**
 * Agent v2 Phase 8 on the Mac (contract §6d): plan card, activity, roster + read markers, starters.
 * `device` is the bridge variant that sends this install's `X-Vibyra-Device`; both are injected so
 * node tests exercise the real requests.
 */
export const overviewClient = (api: Request, device: Request = api) => ({
  plan: async (request: PlanRequest, random: string): Promise<TaskPlan> =>
    parsePlan((await api<{ plan: unknown }>('agents/v2/runs/preview', planBody(request, previewKeyFor(random))))?.plan) ?? bad('task plan'),
  activity: async (filters: ActivityFilters): Promise<ActivityPage> => parseActivity(await api(activityPath(filters))) ?? bad('activity list'),
  roster: async (): Promise<RosterRow[]> => parseRoster(await device('agents/v2/roster')) ?? bad('roster'),
  /** `stale`: the latest run moved on (409 `stale_cursor`): refresh the roster, then mark again. */
  markRead: async (agentId: string, cursor: string): Promise<'ok' | 'stale'> => {
    try { await device(`agents/v2/agents/${agentId}/read`, { cursor }); return 'ok'; }
    catch (error) { if (isStaleCursor(statusOf(error), codeOf(error))) return 'stale'; throw error; }
  },
  templates: async (): Promise<Template[]> => parseTemplates(await api('agents/v2/templates')),
  fromTemplate: async (key: string, id: string, name?: string): Promise<Teammate> => {
    const data = await api<{ teammate?: Teammate }>(`agents/v2/templates/${key}/teammates`, { id, ...(name ? { name } : {}) });
    return data?.teammate && typeof data.teammate.id === 'string' ? data.teammate : bad('teammate');
  },
});
export type OverviewClient = ReturnType<typeof overviewClient>;
