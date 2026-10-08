import type { ProfileFields } from './ProfileEditor';
import type { Teammate } from './types';
import { computerName } from '../../lib/platform.ts';
interface SavedSetup { fields: ProfileFields; revision?: number; pending: Record<string, unknown> | null; error: string }
function validFields(value: unknown): value is ProfileFields {
  if (!value || typeof value !== 'object') return false;
  const v = value as ProfileFields;
  return ['name','brief','memory','avatar'].every(key => typeof v[key as keyof ProfileFields] === 'string')
    && typeof v.budget === 'number' && Array.isArray(v.integrations) && v.integrations.every(id => typeof id === 'string')
    && (v.model === undefined || typeof v.model === 'string') && (v.skillIds === undefined || (Array.isArray(v.skillIds) && v.skillIds.every(id => typeof id === 'string')));
}
/** The editable profile as the server last saved it. */
export function profileFields(agent?: Teammate): ProfileFields {
  return { name: agent?.name ?? '', brief: agent?.brief ?? '', memory: agent?.memory ?? '', budget: agent?.budget ?? 10,
    avatar: agent?.avatar ?? 'sprout', integrations: agent?.integrations ?? [], model: agent?.model ?? 'auto', skillIds: agent?.skillIds ?? [] };
}
export function restoreSetup(raw: string | null, agent?: Teammate): SavedSetup {
  const base: SavedSetup = { fields: profileFields(agent), revision: agent?.revision, pending: null, error: '' };
  if (raw === null) return base;
  try {
    const data = JSON.parse(raw);
    if (!data || Array.isArray(data) || !validFields(data.fields)) throw new Error();
    if (data.revision !== undefined && (!Number.isInteger(data.revision) || data.revision < 1)) throw new Error();
    if (data.pending != null && (!validFields(data.pending) || (agent ? data.pending.revision !== (data.revision ?? agent.revision) : !/^[a-f0-9-]{36}$/i.test(data.pending.id)))) throw new Error();
    // A draft from before the last save (an Allow from a thread, another device) must not show or
    // resave older grants. Its revision stays, so saving it is still refused rather than overwriting.
    const stale = agent && data.pending == null && data.revision !== undefined && data.revision < agent.revision;
    return { fields: stale ? { ...data.fields, integrations: agent.integrations } : data.fields, revision: data.revision ?? agent?.revision, pending: data.pending ?? null, error: '' };
  } catch { return { ...base, error: `The saved setup could not be restored. It has been kept on this ${computerName}; reopen the app before saving again.` }; }
}
