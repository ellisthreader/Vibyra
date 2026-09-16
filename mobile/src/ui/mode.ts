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

// Which home a connection opens on. A connected computer's workspace is the home,
// except a Vibyra Desktop: it only lets the phone watch (and type, if its switch is
// on), so a chat typed on the computer home could never start. The phone's own chat
// stays the home instead, with the Mac's terminals one tap away.
export const computerHome = (workspace: WorkspaceModel) => computerMode(workspace) && workspace.viewOnly !== true;

// Whether work can be started and closed from here: any Host, or a Vibyra Desktop
// whose typing switch is on — that Mac starts the terminal in its own grid and takes
// it down again, so + Terminal and Stop session are offered as they are on a Host.
export const canStartWork = (workspace: Pick<WorkspaceModel, 'viewOnly' | 'canManage'>) =>
  workspace.viewOnly !== true || workspace.canManage === true;

// A computer that has been paired but is not reachable right now still needs a way
// back — and its folders are still worth reading, which is what the phone
// remembers them for.
export const computerRemembered = (workspace: WorkspaceModel) => Boolean(workspace.host);

// The navigation rail's computer destinations, in the order the rail shows them.
// `computers` — the Remote page — is always there: with a computer it shows which
// one, and without one it is the install-and-find flow, so it is also the single
// way a phone-only user gets a computer at all.
//
// Projects appears for any computer this phone has paired, answering or not. It
// used to appear only while one was connected, which meant looking up what you
// were working on required the very thing you did not have. Offline the page
// reads from what that computer was last seen sharing and refuses every action
// with a reason; a phone that has never had a computer still has no projects to
// list, so it is still not offered one.
export function computerPlaces(workspace: WorkspaceModel): Destination[] {
  return computerMode(workspace) || computerRemembered(workspace)
    ? ['computers', 'projects'] : ['computers'];
}
