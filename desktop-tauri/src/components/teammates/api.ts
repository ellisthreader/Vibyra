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
export async function teammateApi<T>(path: string, body?: unknown): Promise<T> {
  const identity = useAccountStore.getState().snapshot.profile?.email;
  if (!identity) throw new Error('Sign in to use teammates.');
  const response = await invoke<T>('teammate_request', { path, body: body ?? null });
  if (identity !== useAccountStore.getState().snapshot.profile?.email) throw new Error('Your account changed.');
  return response;
}
const avatars: Record<string, string> = { site, review, oncall, assistant, lead, bugs, db, qa, sprout };
export function avatarUrl(name: string) { return avatars[name] ?? sprout; }
export const message = (error: unknown) => error instanceof Error ? error.message : String(error);
