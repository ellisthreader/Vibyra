import { useEffect, useMemo } from "react";
import { isRunArtifact } from "../utils/files";
import { createEmptyPersistedSession } from "../utils/persistence";
import type { AppDerivedState, AppState } from "./appStateTypes";
import { emptyFile, emptyProject } from "./appStateDefaults";
import { getPersistedAppState } from "./appStatePersistence";
import { useAccountState } from "./useAccountState";
import { useAppStatePersistence } from "./useAppStatePersistence";
import { useChatState } from "./useChatState";
import { useDesktopState } from "./useDesktopState";
import { useWorkspaceRuntimeState } from "./useWorkspaceRuntimeState";

export function useAppState() {
  const session = useMemo(createEmptyPersistedSession, []);
  const app = useMemo(() => getPersistedAppState(session), [session]);
  const account = useAccountState(session, app);
  const desktop = useDesktopState(session, app);
  const workspace = useWorkspaceRuntimeState(session, app);
  const chat = useChatState(session, app, workspace.state.selectedProjectId);

  useAppStatePersistence(account, desktop, workspace, chat);
  useMergeChatProjects(workspace, chat);

  const state: AppState = {
    ...account.state,
    ...desktop.state,
    ...workspace.state,
    ...chat.state
  };
  const derived = useDerivedAppState(state);
  const { setPersistenceReady: _setReady, setInstallId: _setInstallId, ...accountSetters } = account.setters;

  return {
    state,
    derived,
    setters: {
      ...accountSetters,
      ...desktop.setters,
      ...workspace.setters,
      ...chat.setters
    }
  };
}

function useMergeChatProjects(
  workspace: ReturnType<typeof useWorkspaceRuntimeState>,
  chat: ReturnType<typeof useChatState>
) {
  const { chatProjects } = chat.state;
  const { setProjects } = workspace.setters;
  useEffect(() => {
    setProjects((current) => {
      const known = new Set(current.map((project) => project.id));
      const additions = Object.values(chatProjects).filter((project) => project && !known.has(project.id));
      return additions.length ? [...additions, ...current] : current;
    });
  }, [chatProjects, setProjects]);
}

function useDerivedAppState(state: AppState): AppDerivedState {
  return useMemo(() => {
    const selectedProject = state.projects.find((project) => project.id === state.selectedProjectId)
      ?? state.projects[0] ?? emptyProject;
    const explicitFile = state.files.find((file) => file.id === state.selectedFileId);
    const fallbackFile = state.files.find((file) => !isRunArtifact(file)) ?? state.files[0];
    return {
      selectedProject,
      selectedFile: explicitFile ?? fallbackFile ?? emptyFile,
      activeAgents: state.agents.filter((agent) => agent.state === "running" || agent.state === "waiting"),
      latestOutput: state.logs[0]?.message ?? "No output yet"
    };
  }, [state.agents, state.files, state.logs, state.projects, state.selectedFileId, state.selectedProjectId]);
}
