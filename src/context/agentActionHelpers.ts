import { Agent, FileEntry, Project } from "../types/domain";
import { isRunArtifact } from "../utils/files";
import { makeId } from "../utils/ids";
import { useAppState } from "./useAppState";
import type { AgentStartTarget } from "./appContextTypes";

type State = ReturnType<typeof useAppState>["state"];
type Derived = ReturnType<typeof useAppState>["derived"];

export type ResolvedAgentTarget = {
  project: Project;
  projectId: string;
  chatProjectId: string;
  file: FileEntry | null;
};

export function resolveAgentTarget(
  state: State,
  derived: Derived,
  target?: AgentStartTarget
): ResolvedAgentTarget {
  const explicitProjectId = target?.projectId ?? target?.project?.id ?? target?.chatProjectId;
  const project = target?.project
    ?? (explicitProjectId
      ? (state.projects.find((item) => item.id === explicitProjectId)
        ?? state.chatProjects[explicitProjectId]
        ?? (explicitProjectId === state.selectedProjectId ? derived.selectedProject : undefined)
        ?? makeStubProject(explicitProjectId))
      : derived.selectedProject);
  const projectId = explicitProjectId ?? project.id;
  const chatProjectId = target?.chatProjectId ?? projectId;
  const selectedFile = projectId === state.selectedProjectId && derived.selectedFile?.id !== "empty"
    ? derived.selectedFile
    : null;
  const file = target?.file === null ? null : target?.file ?? selectedFile;

  return {
    project,
    projectId,
    chatProjectId,
    file: file && file.id !== "empty" && !isRunArtifact(file) ? file : null
  };
}

export function makeOptimisticAgent(
  target: ResolvedAgentTarget,
  title: string,
  model: string
): Agent {
  return {
    id: makeId("agent"),
    title,
    model,
    projectId: target.projectId,
    chatProjectId: target.chatProjectId,
    startedAt: Date.now(),
    state: "running",
    progress: 12,
    file: "backend/orchestration"
  };
}

function makeStubProject(id: string): Project {
  return { id, name: id, path: "", stack: "", updated: "" };
}
