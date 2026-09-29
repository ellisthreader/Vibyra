import type { PreviewRunnable } from './runnable';
import type { PreviewTarget } from './types';

/** Runs whose window already opened on this phone. The computer keeps `autoOpen`
 *  on its row while the window lives; each run opens by itself once, in memory. */
const opened = new Set<string>();
let pending: { target: PreviewTarget; at: number } | null = null;
const listeners = new Set<() => void>();
/** A request nobody picked up (the sheet belonged to another project) goes stale. */
const PENDING_MS = 10000;

/** The row whose window should open by itself now, if it has not already. */
export function autoOpenRow(rows: readonly PreviewRunnable[] | undefined): PreviewRunnable | null {
  return rows?.find(row => row.autoOpen === true && row.windowGrantId && row.runId && !opened.has(row.runId)) ?? null;
}

/** The view-only window target for a run: the listed one when present. */
export function runWindowTarget(row: PreviewRunnable, targets: readonly PreviewTarget[]): PreviewTarget {
  const listed = targets.find(target => target.grantId === row.windowGrantId);
  return listed ?? { grantId: row.windowGrantId!, projectId: row.projectId, targetId: row.kind === 'web' ? row.targetId : 'native-window:run:view',
    name: row.name, running: true, kind: row.kind ?? 'window' };
}

/** The window a run's View opens: the one this phone was granted for it or, once the app
 *  is running without such a grant (an agent or the computer started it), the project's
 *  only app window. Otherwise there is nothing certain to open. */
export function runViewTarget(row: PreviewRunnable, targets: readonly PreviewTarget[]): PreviewTarget | null {
  if (row.windowGrantId && (row.kind !== 'web' || row.runState === 'ready')) return runWindowTarget(row, targets);
  if (row.runState !== 'ready') return null;
  if (row.kind === 'web') return targets.find(target => target.targetId === row.targetId && target.running) ?? null;
  const windows = targets.filter(target => target.targetId.startsWith('native-window:'));
  return windows.length === 1 ? windows[0] : null;
}

/** True exactly once per run: whoever claims first opens the window. */
export function claimRunOpen(runId: string): boolean {
  if (opened.has(runId)) return false;
  opened.add(runId);
  return true;
}

/** Hand a window to the Preview sheet, open or about to open. */
export function requestRunOpen(target: PreviewTarget) {
  pending = { target, at: Date.now() };
  for (const listener of listeners) listener();
}

/** The sheet takes the request for its own project; any other is discarded. */
export function takeRunOpen(matches: (target: PreviewTarget) => boolean): PreviewTarget | null {
  const request = pending;
  pending = null;
  if (!request || Date.now() - request.at > PENDING_MS || !matches(request.target)) return null;
  return request.target;
}

export function subscribeRunOpen(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
