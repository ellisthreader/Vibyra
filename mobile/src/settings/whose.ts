import type { Account, WorkspaceModel } from '../ui/types';

/** The account Settings shows: the signed-in one, or — in a sample opened signed out —
 *  the sample's stand-in, so its Account pages can still be tried. */
export const settingsAccount = (workspace: WorkspaceModel): Account | null =>
  workspace.account ?? (workspace.demo ? workspace.sampleAccount ?? null : null);

/** The development Test button's account: a real-looking account inside the sample workspace. */
export const isTestAccount = (workspace: WorkspaceModel) => Boolean(workspace.demo && workspace.account);

/** Said once on every Account page in the sample, so nothing there reads as saved. */
export const sampleNote = (workspace: WorkspaceModel) =>
  isTestAccount(workspace) ? 'Test account · nothing here is saved.' : 'Sample account · nothing here is saved.';
