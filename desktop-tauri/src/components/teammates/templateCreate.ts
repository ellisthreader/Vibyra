import { templateMarkKey } from '../../../../mobile/src/agents/v2/templatesModel.ts';
import type { OverviewClient } from './overviewClient.ts';
import type { Teammate } from './types.ts';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
/** A definitive refusal releases the saved id; anything uncertain keeps it so a retry creates the same teammate once. */
const definitive = (detail: string) => /^(400|402|403|404|409|422):/.test(detail);

/**
 * Creates the profile from a starter (contract §6d). The id is saved before the request and kept until
 * a response is seen, so an interrupted create retried later is the same idempotent request. On success
 * the starter is remembered for this teammate so its suggestions can be shown; nothing is granted or scheduled.
 */
export async function createFromTemplate(client: Pick<OverviewClient, 'fromTemplate'>, storage: Store, identity: string, key: string,
  uuid: () => string = () => crypto.randomUUID()): Promise<Teammate> {
  const saved = `teammate-template-create.${encodeURIComponent(identity)}.${key}`;
  let id: string | null = null;
  try { id = storage.getItem(saved); } catch { /* a fresh id still works once */ }
  id ||= uuid();
  try { storage.setItem(saved, id); } catch { /* ignore */ }
  try {
    const teammate = await client.fromTemplate(key, id);
    try { storage.removeItem(saved); storage.setItem(templateMarkKey(identity, teammate.id), JSON.stringify({ key })); } catch { /* suggestions just will not show */ }
    return teammate;
  } catch (error) {
    if (definitive(error instanceof Error ? error.message : String(error))) { try { storage.removeItem(saved); } catch { /* ignore */ } }
    throw error;
  }
}
