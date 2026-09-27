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
export function restoreSetup(raw: string | null, agent?: Teammate): SavedSetup {
  const base: SavedSetup = { fields: { name: agent?.name ?? '', brief: agent?.brief ?? '', memory: agent?.memory ?? '', budget: agent?.budget ?? 10,
    avatar: agent?.avatar ?? 'sprout', integrations: agent?.integrations ?? [], model: agent?.model ?? 'auto', skillIds: agent?.skillIds ?? [] }, revision: agent?.revision, pending: null, error: '' };
  if (raw === null) return base;
  try {
    const data = JSON.parse(raw);
    if (!data || Array.isArray(data) || !validFields(data.fields)) throw new Error();
    if (data.revision !== undefined && (!Number.isInteger(data.revision) || data.revision < 1)) throw new Error();
    if (data.pending != null && (!validFields(data.pending) || (agent ? data.pending.revision !== (data.revision ?? agent.revision) : !/^[a-f0-9-]{36}$/i.test(data.pending.id)))) throw new Error();
    return { fields: data.fields, revision: data.revision ?? agent?.revision, pending: data.pending ?? null, error: '' };
  } catch { return { ...base, error: `The saved setup could not be restored. It has been kept on this ${computerName}; reopen the app before saving again.` }; }
}
