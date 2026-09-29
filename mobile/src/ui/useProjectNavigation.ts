import { useEffect, useRef, useState } from 'react';
import type { VibesStore } from '../vibes/VibesStore';
import { chatProjectId, IDEAS_PROJECT_ID, isIdeas } from './ideas';
import { sessionsInProject } from './DrawerProjects';
import type { Destination, WorkspaceModel } from './types';

/** Code home offers projects; an available project exposes its own composer. */
export function useProjectNavigation(workspace: WorkspaceModel, vibes: VibesStore | null) {
  const [destination, setDestination] = useState<Destination>('work');
  const [projectId, setProjectId] = useState<string | null>(IDEAS_PROJECT_ID);
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [projectChatOpen, setProjectChatOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const launcherReturn = useRef<{ destination: Destination; sessionId: string | null; projectId: string | null; projectChatOpen: boolean } | null>(null);
  const live = useRef({ workspace, vibes, destination, projectId });
  live.current = { workspace, vibes, destination, projectId };
  // A new sample or a finished welcome starts at the home: the project chooser.
  useEffect(() => {
    setDestination('work');
    setProjectId(IDEAS_PROJECT_ID);
    setFocusedSessionId(null);
    setLauncherOpen(false);
    launcherReturn.current = null;
    setProjectChatOpen(false);
    setDrawer(false);
  }, [workspace.demo, workspace.onboarding.status]);
  const lastOpened = useRef<string | null>(null);
  // Opening a terminal puts you in its project.
  useEffect(() => {
    if (workspace.selectedSessionId === lastOpened.current) return;
    const open = workspace.sessions.find((item) => item.id === workspace.selectedSessionId);
    lastOpened.current = open?.id ?? null;
    if (open) {
      setLauncherOpen(false);
      setProjectChatOpen(false);
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
  /** Return to Code home; unbound phone selections do not expose a composer. */
  const enterIdeas = (chatId: string | null) => {
    selectChat(chatId);
    setProjectId(IDEAS_PROJECT_ID);
    setFocusedSessionId(null);
    setLauncherOpen(false);
    launcherReturn.current = null;
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
    setLauncherOpen(false);
    launcherReturn.current = null;
    workspace.actions.selectSession(null);
    setDestination('work');
  };
  /** Folder taps open a terminal or its launcher; saved phone chats require a chat tap. */
  const enterProject = (id: string) => {
    if (isIdeas(id)) {
      backToIdeas();
      setDrawer(true);
      return;
    }
    const chat = selectedChat();
    if (chat && chatProjectId(chat, workspace) !== id) selectChat(null);
    setProjectId(id);
    setProjectChatOpen(false);
    launcherReturn.current = null;
    const current = workspace.sessions.find((item) => item.id === workspace.selectedSessionId && item.projectId === id);
    const next = current ?? sessionsInProject(workspace.sessions, id)[0];
    setFocusedSessionId(next?.id ?? null);
    setLauncherOpen(!next);
    workspace.actions.selectSession(next?.id ?? null);
    setDestination('work');
    setDrawer(false);
  };
  /** New terminal opens this folder's launcher even when another terminal is open. */
  const newTerminal = (id: string) => {
    if (!launcherOpen) launcherReturn.current = {
      destination, projectId, projectChatOpen,
      sessionId: destination === 'work' ? focusedSessionId ?? workspace.selectedSessionId : null,
    };
    setProjectId(id);
    setProjectChatOpen(false);
    setFocusedSessionId(null);
    setLauncherOpen(true);
    workspace.actions.selectSession(null);
    setDestination('work');
    setDrawer(false);
  };
  /** A terminal row carries its exact identity into the screen immediately.
   * Host refreshes may briefly clear the store selection while it reconnects. */
  const openSession = (id: string) => {
    // A completed launch may be absent from this callback's captured list.
    const current = live.current.workspace;
    const session = current.sessions.find((item) => item.id === id);
    if (!session) return;
    launcherReturn.current = null;
    setFocusedSessionId(id);
    setLauncherOpen(false);
    setProjectChatOpen(false);
    setProjectId(session.projectId);
    // Keep createSession's loaded conversation; allow retrying a failed load.
    if (current.selectedSessionId !== id || (!current.syncing && current.conversation?.sessionId !== id))
      current.actions.selectSession(id);
    setDestination('work');
    setDrawer(false);
  };
  const backFromTerminalLauncher = () => {
    const previous = launcherReturn.current;
    launcherReturn.current = null;
    if (previous?.destination === 'work' && previous.sessionId &&
      workspace.sessions.some(item => item.id === previous.sessionId)) {
      openSession(previous.sessionId);
      return;
    }
    if (previous?.destination === 'work' && previous.projectChatOpen && previous.projectId) {
      setProjectId(previous.projectId);
      setProjectChatOpen(true);
      setLauncherOpen(false);
      setDrawer(false);
      return;
    }
    backToIdeas();
    setDrawer(false);
    if (previous?.destination && previous.destination !== 'work') setDestination(previous.destination);
  };
  /** Back out of a folder: the screen returns to Ideas, the rail to its home face, and stays open. */
  const leaveProject = () => backToIdeas();
  /** Show whichever chat is selected in the store, inside the project it belongs to. */
  const showSelectedChat = () => {
    setProjectChatOpen(true);
    const chat = selectedChat();
    const id = chat ? chatProjectId(chat, live.current.workspace) : IDEAS_PROJECT_ID;
    setProjectId(id);
    setFocusedSessionId(null);
    setLauncherOpen(false);
    workspace.actions.selectSession(null);
    setDestination('work');
    setDrawer(false);
  };
  /** The header's New chat. Inside a folder it clears that folder's surface;
   *  anywhere else it is a fresh chat in Ideas. */
  const newChat = () => {
    if (destination === 'work' && projectId && !isIdeas(projectId)) {
      setProjectChatOpen(false);
      const chat = selectedChat();
      if (chat && chatProjectId(chat, workspace) === projectId) selectChat(null);
      setFocusedSessionId(null);
      setLauncherOpen(true);
      workspace.actions.selectSession(null);
      setDrawer(false);
      return;
    }
    enterIdeas(null);
  };
  const projectBuilt = (built: { id: string }, openTerminal: boolean) => {
    setProjectChatOpen(false);
    setProjectId(built.id);
    setFocusedSessionId(null);
    setLauncherOpen(true);
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
    launcherOpen,
    projectChatOpen,
    drawer,
    setDrawer,
    enterIdeas,
    enterProject,
    newTerminal,
    backFromTerminalLauncher,
    openSession,
    leaveProject,
    showSelectedChat,
    newChat,
    projectBuilt,
  };
}
