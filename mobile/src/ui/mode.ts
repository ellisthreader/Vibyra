import type { WorkspaceModel } from './types';

// Vibyra has one home — the projects list — and a computer is something a project
// gains, never something the app demands before it will talk to you.
//
// Phone only — no computer is connected: the Ideas project holds the phone's own
// chats. No terminals, no computer agents and no connection status anywhere in
// the app; Remote is the one way to add a computer.
//
// Computer connected: the same home, with the computer's folders listed as
// projects. Each adds terminals, computer agents and file tools; the header shows
// the connected state. Connecting never changes which screen you are on.
//
// The sample workspace reports `connected`, so previewing it shows a computer.
export const computerMode = (workspace: WorkspaceModel) => workspace.status === 'connected';

// Whether work can be started and closed from here: any Host, or a Vibyra Desktop
// whose typing switch is on — that Mac starts the terminal in its own grid and takes
// it down again, so + Terminal and Stop session are offered as they are on a Host.
export const canStartWork = (workspace: Pick<WorkspaceModel, 'viewOnly' | 'canManage'>) =>
  workspace.viewOnly !== true || workspace.canManage === true;

// A computer that has been paired but is not reachable right now still needs a way
// back — and its folders are still worth reading, which is what the phone
// remembers them for.
export const computerRemembered = (workspace: WorkspaceModel) => Boolean(workspace.host);
