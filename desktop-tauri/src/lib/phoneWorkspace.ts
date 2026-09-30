import { paneLabel } from "./paneLabel";
import { isSuspendedId } from "./sessionRestore";
import type { PhonePane, PhoneProject } from "../ipc/phone";
import type { PaneState } from "../state/terminalStoreTypes";
import type { ProjectSpec } from "../types";

// What a phone watching this Mac is told it is looking at. Pure and free of
// IPC, because the answer is this window's alone: Rust holds the PTYs but not
// the workspace, and a launch folder recovers neither a project's name nor
// which project a pane belongs to — an SSH pane has no folder, and two
// projects can share a root. `phoneWorkspaceSync.ts` is what sends it.

/** `~/Desktop/Vibyra`, not `/Users/ellis/Desktop/Vibyra`: this sits under the
 * project's name on a phone-width row, where the account name is only noise. */
export function shortenRoot(root: string, homeDir: string): string {
  const home = homeDir.replace(/\/+$/, "");
  if (!home || (root !== home && !root.startsWith(`${home}/`))) return root;
  return `~${root.slice(home.length)}`;
}

/** Suspended panes are left out. They have no process for a phone to watch, so
 * listing one would offer output nothing is producing — and a restored pane
 * carries a negative placeholder id, which is not a session id at all. */
export interface ShownChats {
  /** Whether the chat list has been read at all this run. Until it has, the
   * window cannot say which chats it shows, and must not claim "none". */
  loaded: boolean;
  sessions: { id: string }[];
  /** The conversations whose cards are up on the Mac's grid. A chat the
   * person closed, or one saved from an earlier run, is not one of them. */
  open: string[];
}

/** The shared chats the phone should list as terminals: the ones the grid
 * draws. The engine keeps every conversation ever had; those are history. */
export function shownChats(chats: ShownChats): string[] | null {
  if (!chats.loaded) return null;
  return chats.sessions.filter((chat) => chats.open.includes(chat.id)).map((chat) => chat.id);
}

export function phoneWorkspacePayload(
  projects: ProjectSpec[],
  panes: PaneState[],
  homeDir: string,
  chats: ShownChats = { loaded: false, sessions: [], open: [] },
): { projects: PhoneProject[]; panes: PhonePane[]; chats: string[] | null } {
  return {
    chats: shownChats(chats),
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      path: shortenRoot(project.root, homeDir),
    })),
    panes: panes
      .filter((pane) => !isSuspendedId(pane.id) && pane.status !== "suspended")
      .map((pane) => ({ id: pane.id, projectId: pane.projectId, title: paneLabel(pane) })),
  };
}
