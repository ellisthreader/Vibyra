import type { Destination, WorkspaceModel } from './types';

// Vibyra has exactly two modes and the computer connection is the only thing that
// chooses between them.
//
// Phone only — no computer is connected: an ordinary OpenRouter chat. No projects,
// no terminals, no computer agents and no connection status anywhere in the app.
//
// Computer connected: the full remote workspace. Every shared project the computer
// reports, the Terminals section, computer agents and a visible connected state.
//
// The sample workspace reports `connected`, so previewing it shows the computer mode.
export const computerMode = (workspace: WorkspaceModel) => workspace.status === 'connected';

// A computer that has been paired but is not reachable right now still needs a way
// back. Its workspace stays hidden; only reconnecting remains reachable.
export const computerRemembered = (workspace: WorkspaceModel) => Boolean(workspace.host);

// The navigation rail's computer destinations, in the order the rail shows them.
// `computers` — the Remote page — is always there: with a computer it shows which
// one, and without one it is the install-and-find flow, so it is also the single
// way a phone-only user gets a computer at all. Projects only appears while a
// computer is actually answering, because there are no folders to list otherwise.
export function computerPlaces(workspace: WorkspaceModel): Destination[] {
  return computerMode(workspace) ? ['computers', 'projects'] : ['computers'];
}
