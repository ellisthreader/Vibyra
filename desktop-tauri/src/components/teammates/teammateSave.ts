import { providerPreference } from '../../../../mobile/src/agents/engineProviders';
import { teammateApi } from './api';
import type { ProfileFields } from './ProfileEditor';
import { profileFields } from './setupStorage';
import type { Teammate } from './types';

/** The exact save request: an edit carries the revision it was based on. */
export function saveBody(fields: ProfileFields, agent: Teammate | undefined, revision = agent?.revision): Record<string, unknown> {
  return { ...fields, model: providerPreference(fields.model), ...(agent ? { revision } : { id: crypto.randomUUID() }) };
}

/** Saves the teammate with one more service allowed, on its current revision.
 * A stale revision is refused with a 409, so it never overwrites a newer save. */
export async function allowService(agent: Teammate, service: string): Promise<Teammate> {
  return setService(agent, service, true);
}

/** Saves the teammate with one service allowed or removed, on its current
 * revision, so the Overview's switches save exactly like the Access tab. */
export async function setService(agent: Teammate, service: string, allowed: boolean): Promise<Teammate> {
  const has = agent.integrations.includes(service);
  const integrations = allowed ? (has ? agent.integrations : [...agent.integrations, service]) : agent.integrations.filter(id => id !== service);
  const result = await teammateApi<{ teammate: Teammate }>(`agents/v1/teammates/${agent.id}`, saveBody({ ...profileFields(agent), integrations }, agent));
  return result.teammate;
}
