import site from '../../assets/teammates/site.webp';
import review from '../../assets/teammates/review.webp';
import oncall from '../../assets/teammates/oncall.webp';
import assistant from '../../assets/teammates/assistant.webp';
import lead from '../../assets/teammates/lead.webp';
import bugs from '../../assets/teammates/bugs.webp';
import db from '../../assets/teammates/db.webp';
import qa from '../../assets/teammates/qa.webp';
import sprout from '../../assets/teammates/sprout.webp';
import { invoke } from '@tauri-apps/api/core';
import { useAccountStore } from '../../state/accountStore';
import { toBridgeError } from './bridgeError';
import { macDevice } from './deviceId';
/** `method` is only for the PATCH/PUT/DELETE routes the bridge allows; otherwise a body means POST. */
export async function teammateApi<T>(path: string, body?: unknown, method?: 'PATCH' | 'PUT' | 'DELETE'): Promise<T> {
  const identity = useAccountStore.getState().snapshot.profile?.email;
  if (!identity) throw new Error('Sign in to use teammates.');
  let response: T;
  try { response = await invoke<T>('teammate_request', method ? { path, body: body ?? null, method } : { path, body: body ?? null }); }
  catch (error) { throw toBridgeError(error); }
  if (identity !== useAccountStore.getState().snapshot.profile?.email) throw new Error('Your account changed.');
  return response;
}
/** The roster list and read marker only: sent with this install's stable `X-Vibyra-Device` (contract §6d). */
export async function teammateApiDevice<T>(path: string, body?: unknown): Promise<T> {
  const identity = useAccountStore.getState().snapshot.profile?.email;
  if (!identity) throw new Error('Sign in to use teammates.');
  let response: T;
  try { response = await invoke<T>('teammate_request_device', { path, body: body ?? null, device: macDevice() }); }
  catch (error) { throw toBridgeError(error); }
  if (identity !== useAccountStore.getState().snapshot.profile?.email) throw new Error('Your account changed.');
  return response;
}
const avatars: Record<string, string> = { site, review, oncall, assistant, lead, bugs, db, qa, sprout };
export function avatarUrl(name: string) { return avatars[name] ?? sprout; }
export const message = (error: unknown) => error instanceof Error ? error.message : String(error);
