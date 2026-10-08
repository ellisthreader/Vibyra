import { paneLabel } from "./paneLabel.ts";
import { isSuspendedId } from "./sessionRestore.ts";
import type { PhonePane, PhoneProject, PhoneSavedPane } from "../ipc/phone";
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

/** Chat visibility follows the Mac sidebar; saved panes travel separately
 * from live PTYs because their negative IDs do not name a running process. */
export interface ShownChats {
  /** Whether the chat list has been read at all this run. Until it has, the
   * window cannot say which chats it shows, and must not claim "none". */
  loaded: boolean;
  sessions: { id: string; status?: string; title?: string }[];
  /** The conversations whose cards are up on the Mac's grid. A chat the
   * person closed, or one saved from an earlier run, is not one of them. */
  open: string[];
}

/** The phone terminal list mirrors the Mac sidebar: open cards plus running
 * conversations. Closing a grid card does not stop its process. */
export function shownChats(chats: ShownChats): string[] | null {
  if (!chats.loaded) return null;
  return chats.sessions.filter((chat) => chats.open.includes(chat.id) || chat.status === "running").map((chat) => chat.id);
}

export function phoneWorkspacePayload(
  projects: ProjectSpec[],
  panes: PaneState[],
  homeDir: string,
  chats: ShownChats = { loaded: false, sessions: [], open: [] },
): { projects: PhoneProject[]; panes: PhonePane[]; saved: PhoneSavedPane[]; chats: string[] | null; chatTitles: Record<string, string> } {
  return {
    chats: shownChats(chats),
    // Each chat's name as the Mac shows it, so the phone lists it under the same one.
    chatTitles: Object.fromEntries(chats.sessions.flatMap((chat) => chat.title ? [[chat.id, chat.title]] : [])),
    saved: panes.filter(pane => isSuspendedId(pane.id) && pane.status === 'suspended')
      .map(pane => ({ id: pane.id, projectId: pane.projectId, title: paneLabel(pane), kind: pane.agentId })),
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
