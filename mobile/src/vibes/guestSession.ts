import { randomUUID } from 'expo-crypto';
import { deleteSecure, readSecure, writeSecure } from '../transport/secureStorage';
import { readFlag, writeFlag } from '../transport/deviceFlags';
import type { VibesApi } from './types';
import { GUEST_INSTALL_ID_KEY, GUEST_TOKEN_KEY } from './guestKeys';

async function installId() {
  const saved = await readFlag(GUEST_INSTALL_ID_KEY);
  if (saved) return saved;
  const created = randomUUID();
  // Keep the install identity before asking for a funded trial. A retry after an
  // interrupted response must not look like a second installation.
  await writeFlag(GUEST_INSTALL_ID_KEY, created);
  return created;
}

async function issue(api: VibesApi) {
  if (!api.guest) return false;
  const session = await api.guest.create(await installId());
  await writeSecure(GUEST_TOKEN_KEY, session.token);
  return true;
}

async function prepare(api: VibesApi) {
  if (!api.guest) return false;
  const saved = await readSecure(GUEST_TOKEN_KEY);
  if (saved) api.guest.restore(saved);
  else await issue(api);
  return true;
}

export async function renewGuest(api: VibesApi) {
  api.guest?.restore(null);
  await deleteSecure(GUEST_TOKEN_KEY);
  return issue(api);
}

// Chat and integrations can start together. They must share one issued guest.
const preparing = new WeakMap<VibesApi, Promise<boolean>>();
export function prepareGuest(api: VibesApi): Promise<boolean> {
  const pending = preparing.get(api);
  if (pending) return pending;
  const task = prepare(api).finally(() => preparing.delete(api));
  preparing.set(api, task);
  return task;
}
