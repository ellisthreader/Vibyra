import { apiUrl, requestJson } from '../../transport/requestJson';
import { identified, requiredObject } from '../../transport/responseShape';
import type { AttachmentSource, VibesAttachment } from '../../vibes/types';
import type { Teammate } from '../types';
import { activityPath, parseActivity, type ActivityFilters, type ActivityPage } from './activityModel';
import { isStaleCursor, parseRoster, parseUpload, uploadProblem, type RosterRow } from './overviewModel';
import { parsePlan, planBody, previewKeyFor, type PlanRequest, type TaskPlan } from './planModel';
import { RunError, fixOf } from './runsApi';
import { parseTemplates, type Template } from './templatesModel';

/** Agent v2 Phase 8 client (contract §6d): plan card, activity, roster + read markers, uploads, starters. */
export interface OverviewApi {
  plan(request: PlanRequest, key: string): Promise<TaskPlan>;
  activity(filters: ActivityFilters): Promise<ActivityPage>;
  roster(): Promise<RosterRow[]>;
  /** `stale`: the latest run moved on (409 `stale_cursor`); refresh the roster, then mark again. */
  markRead(agentId: string, cursor: string): Promise<'ok' | 'stale'>;
  upload(source: AttachmentSource): Promise<VibesAttachment>;
  templates(): Promise<Template[]>;
  fromTemplate(key: string, id: string, name?: string): Promise<Teammate>;
}
const enc = encodeURIComponent;

/** `device` supplies this install's stable id for the roster and read marker; without it the signed-in session is the device. */
export function createOverviewApi(baseUrl: string, token: () => string | null, fetcher: typeof fetch = fetch,
  device?: () => Promise<string>): OverviewApi {
  const call = async (path: string, body?: unknown, options: { device?: boolean } = {}) => {
    const identity = token();
    if (!identity) throw new RunError('Sign in to message your teammates.', 401, null);
    const form = typeof FormData !== 'undefined' && body instanceof FormData ? body : null;
    let result;
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${identity}`, Accept: 'application/json', ...(form ? {} : { 'Content-Type': 'application/json' }) };
      if (options.device && device) headers['X-Vibyra-Device'] = await device();
      result = await requestJson(fetcher, apiUrl(baseUrl, path), {
        method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : form ?? JSON.stringify(body),
      }, form ? 60000 : 25000);
    } catch { throw new RunError('Connection interrupted. Try again.', 0, null); }
    const { response, data } = result;
    if (identity !== token()) throw new RunError('Your account changed. Refresh to continue.', 401, null);
    if (!response.ok) {
      const field = data.errors && typeof data.errors === 'object' ? Object.values(data.errors as Record<string, string[]>)[0]?.[0] : undefined;
      throw new RunError(data.error ?? field ?? data.message ?? 'Teammate tasks could not be reached.', response.status,
        typeof data.code === 'string' ? data.code : null, fixOf(data));
    }
    return data;
  };
  const bad = (what: string): never => { throw new RunError(`This server returned an unsupported ${what}.`, 502, null); };
  return {
    plan: async (request, key) => parsePlan((await call('agents/v2/runs/preview', planBody(request, previewKeyFor(key)))).plan) ?? bad('task plan'),
    activity: async filters => parseActivity(await call(activityPath(filters))) ?? bad('activity list'),
    roster: async () => parseRoster(await call('agents/v2/roster', undefined, { device: true })) ?? bad('roster'),
    markRead: async (agentId, cursor) => {
      try { await call(`agents/v2/agents/${enc(agentId)}/read`, { cursor }, { device: true }); return 'ok'; }
      catch (error) {
        if (error instanceof RunError && isStaleCursor(error.status, error.code)) return 'stale';
        throw error;
      }
    },
    upload: async source => {
      const problem = uploadProblem(source.name, source.mimeType, source.file?.size ?? 0);
      if (problem) throw new RunError(problem, 422, null);
      const form = new FormData();
      form.append('file', (source.file ?? { uri: source.uri, name: source.name, type: source.mimeType }) as Blob, source.name);
      const uploaded = parseUpload(await call('agents/v2/attachments', form)) ?? bad('attachment');
      return { id: uploaded.id, kind: uploaded.kind, name: uploaded.name, bytes: uploaded.bytes };
    },
    templates: async () => parseTemplates(await call('agents/v2/templates')),
    fromTemplate: async (key, id, name) => {
      const data = await call(`agents/v2/templates/${enc(key)}/teammates`, { id, ...(name ? { name } : {}) });
      return requiredObject<Teammate>(data.teammate, 'Teammate', identified);
    },
  };
}
