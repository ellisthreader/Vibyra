import type { ResolvedAgentTarget } from "./agentActionHelpers";
import { projectFileContext, type ProjectFileContext } from "./agentContextPayload";
import type { useAppState } from "./useAppState";

type State = ReturnType<typeof useAppState>["state"];
type Requests = {
  agentRequest: <T>(endpoint: string, options?: RequestInit, useAuth?: boolean) => Promise<T>;
};

export async function buildAgentProjectFiles(
  state: State,
  requests: Requests,
  target: ResolvedAgentTarget,
  intentText: string,
  fileAttachments: ProjectFileContext[],
  allowDesktopContext: boolean
) {
  const filesInActiveProject = target.projectId === state.selectedProjectId ? state.files : [];
  const canUseDesktopContext = allowDesktopContext && Boolean(state.connection);
  return [
    ...fileAttachments,
    ...(await projectFileContext(
      filesInActiveProject,
      intentText,
      canUseDesktopContext ? async (path) => (
        await requests.agentRequest<{ file: typeof state.files[number] }>(`/files/read?projectId=${encodeURIComponent(target.projectId)}&path=${encodeURIComponent(path)}`)
      ).file : undefined,
      canUseDesktopContext ? async (query) => (
        await requests.agentRequest<{ files: ProjectFileContext[] }>(`/desktop/context?projectId=${encodeURIComponent(target.projectId)}&q=${encodeURIComponent(query)}`)
      ).files ?? [] : undefined
    ))
  ];
}
