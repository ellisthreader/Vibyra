import { useEffect, useRef, useState } from 'react';
import type { VibesStore } from '../vibes/VibesStore';
import { chatProjectId, IDEAS_PROJECT_ID, isIdeas } from './ideas';
import { sessionsInProject } from './DrawerProjects';
import type { Destination, WorkspaceModel } from './types';

/**
 * Where you are: a page, or a project on the work surface. The app opens in
 * Ideas — the phone's own chat, a project like the others — and the work
 * surface is never shown without a project, so entering, leaving and losing a
 * computer all resolve to Ideas or to a folder. The rail is the list of them.
 */
export function useProjectNavigation(workspace: WorkspaceModel, vibes: VibesStore | null) {
  const [destination, setDestination] = useState<Destination>('work');
  const [projectId, setProjectId] = useState<string | null>(IDEAS_PROJECT_ID);
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const live = useRef({ workspace, vibes, destination, projectId });
  live.current = { workspace, vibes, destination, projectId };
  // A new sample or a finished welcome starts at the home: Ideas, ready to type into.
  useEffect(() => {
    setDestination('work');
    setProjectId(IDEAS_PROJECT_ID);
    setFocusedSessionId(null);
    setDrawer(false);
  }, [workspace.demo, workspace.onboarding.status]);
  // Opening a terminal puts you in its project.
  useEffect(() => {
    const open = workspace.sessions.find((item) => item.id === workspace.selectedSessionId);
    if (open) {
      setFocusedSessionId(open.id);
      setProjectId(open.projectId);
      setDestination('work');
    }
  }, [workspace.selectedSessionId, workspace.sessions]);
  const selectChat = (id: string | null) => {
    if (vibes) void vibes.select(id).catch((error) => vibes.error(error));
  };
  const selectedChat = () => {
    const state = vibes?.state;
    return state?.chats.find((chat) => chat.id === state.selected) ?? null;
  };
  /** The phone's chat surface, on a given chat or ready for a new one. */
  const enterIdeas = (chatId: string | null) => {
    selectChat(chatId);
    setProjectId(IDEAS_PROJECT_ID);
    setFocusedSessionId(null);
    workspace.actions.selectSession(null);
    setDestination('work');
    setDrawer(false);
  };
  /** Ideas with whatever it already had open: the chat stays if it is one of Ideas' own. */
  const backToIdeas = () => {
    const chat = selectedChat();
    if (chat && !isIdeas(chatProjectId(chat, workspace))) selectChat(null);
    setProjectId(IDEAS_PROJECT_ID);
    setFocusedSessionId(null);
    workspace.actions.selectSession(null);
    setDestination('work');
  };
  /** Enter a project from its row. A folder opens the rail at once on its own
   *  face; Ideas is a chat, so it takes the screen and the rail steps aside. */
  const enterProject = (id: string) => {
    if (isIdeas(id)) {
      backToIdeas();
      setDrawer(true);
      return;
    }
    const chat = selectedChat();
    if (chat && chatProjectId(chat, workspace) !== id) selectChat(null);
    setProjectId(id);
    const current = workspace.sessions.find((item) => item.id === workspace.selectedSessionId && item.projectId === id);
    const next = current ?? sessionsInProject(workspace.sessions, id)[0];
    setFocusedSessionId(next?.id ?? null);
    workspace.actions.selectSession(next?.id ?? null);
    setDestination('work');
    setDrawer(false);
  };
  /** A terminal row carries its exact identity into the screen immediately.
   * Host refreshes may briefly clear the store selection while it reconnects. */
  const openSession = (id: string) => {
    const session = workspace.sessions.find((item) => item.id === id);
    if (!session) return;
    setFocusedSessionId(id);
    setProjectId(session.projectId);
    workspace.actions.selectSession(id);
    setDestination('work');
    setDrawer(false);
  };
  /** Back out of a folder: the screen returns to Ideas, the rail to its home face, and stays open. */
  const leaveProject = () => backToIdeas();
  /** Show whichever chat is selected in the store, inside the project it belongs to. */
  const showSelectedChat = () => {
    const chat = selectedChat();
    const id = chat ? chatProjectId(chat, live.current.workspace) : IDEAS_PROJECT_ID;
    setProjectId(id);
    setFocusedSessionId(null);
    workspace.actions.selectSession(null);
    setDestination('work');
    setDrawer(false);
  };
  /** The header's New chat. Inside a folder it clears that folder's surface;
   *  anywhere else it is a fresh chat in Ideas. */
  const newChat = () => {
    if (destination === 'work' && projectId && !isIdeas(projectId)) {
      const chat = selectedChat();
      if (chat && chatProjectId(chat, workspace) === projectId) selectChat(null);
      setFocusedSessionId(null);
      workspace.actions.selectSession(null);
      setDrawer(false);
      return;
    }
    enterIdeas(null);
  };
  const projectBuilt = (built: { id: string }, openTerminal: boolean) => {
    setProjectId(built.id);
    setFocusedSessionId(null);
    setDestination('work');
    if (openTerminal)
      void workspace.actions.createSession(built.id, 'shell', 'Terminal').catch(() => {});
    else setDrawer(true);
  };
  return {
    destination,
    setDestination,
    projectId,
    focusedSessionId,
    drawer,
    setDrawer,
    enterIdeas,
    enterProject,
    openSession,
    leaveProject,
    showSelectedChat,
    newChat,
    projectBuilt,
  };
}
