import { useState } from "react";
import { starterAgents, starterChanges, starterFiles, starterLogs, starterProjects } from "../data/appData";
import type { ReasoningEffort } from "../types/domain";
import type { PersistedSession } from "../utils/persistence";
import type { AppState } from "./appStateTypes";
import type { getPersistedAppState } from "./appStatePersistence";

export function useWorkspaceRuntimeState(session: PersistedSession, app: ReturnType<typeof getPersistedAppState>) {
  const [projects, setProjects] = useState(starterProjects);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedModel, setSelectedModel] = useState<AppState["selectedModel"]>(app.selectedModel);
  const [selectedChatModel, setSelectedChatModel] = useState(session.selectedChatModel);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("medium");
  const [agents, setAgents] = useState(starterAgents);
  const [logs, setLogs] = useState(starterLogs);
  const [files, setFiles] = useState(starterFiles);
  const [changes, setChanges] = useState(starterChanges);
  const [selectedFileId, setSelectedFileId] = useState("empty");
  const [buildState, setBuildState] = useState<AppState["buildState"]>("idle");
  const [previewState, setPreviewState] = useState<AppState["previewState"]>("offline");
  const [workflowIndex, setWorkflowIndex] = useState(0);
  const [lastPrompt, setLastPrompt] = useState("");
  const [agentRequesting, setAgentRequesting] = useState(false);
  const [newFilePath, setNewFilePath] = useState("note.txt");
  const [command, setCommand] = useState("npm run build");
  return {
    state: { projects, selectedProjectId, selectedModel, selectedChatModel, reasoningEffort, agents, logs, files,
      changes, selectedFileId, buildState, previewState, workflowIndex, lastPrompt, agentRequesting, newFilePath, command },
    setters: { setProjects, setSelectedProjectId, setSelectedModel, setSelectedChatModel, setReasoningEffort,
      setAgents, setLogs, setFiles, setChanges, setSelectedFileId, setBuildState, setPreviewState, setWorkflowIndex,
      setLastPrompt, setAgentRequesting, setNewFilePath, setCommand }
  };
}
