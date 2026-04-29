import { useMemo, useState } from "react";
import {
  starterAgents,
  starterChanges,
  starterFiles,
  starterLogs,
  starterProjects
} from "../data/appData";
import { getDefaultAgentUrl } from "../utils/network";
import { AppDerivedState, AppState } from "./appContextTypes";
import { ChatMessage, FileEntry, ReasoningEffort } from "../types/domain";

const emptyFile: FileEntry = {
  id: "empty",
  name: "No files",
  path: "No files loaded",
  language: "txt",
  changed: "clean",
  body: "Select a project with readable files."
};

const welcomeMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    text: "Pick a file, then tell Vibyra what to change. I can create or rewrite files in this project."
  }
];

export function useAppState() {
  const [authenticated, setAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [paired, setPaired] = useState(false);
  const [agentUrl, setAgentUrl] = useState(getDefaultAgentUrl);
  const [pairCode, setPairCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [pairingError, setPairingError] = useState("");
  const [pairingMessage, setPairingMessage] = useState("Open Vibyra Desktop and type the code shown there.");
  const [healthMessage, setHealthMessage] = useState("");
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [pendingPhoneApproval, setPendingPhoneApproval] = useState<AppState["pendingPhoneApproval"]>(null);
  const [connection, setConnection] = useState<AppState["connection"]>(null);
  const [machineName, setMachineName] = useState("Vibyra Desktop");
  const [projects, setProjects] = useState(starterProjects);
  const [selectedProjectId, setSelectedProjectId] = useState("p1");
  const [selectedModel, setSelectedModel] = useState<AppState["selectedModel"]>("gpt-5.5");
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("medium");
  const [agents, setAgents] = useState(starterAgents);
  const [logs, setLogs] = useState(starterLogs);
  const [files, setFiles] = useState(starterFiles);
  const [changes, setChanges] = useState(starterChanges);
  const [selectedFileId, setSelectedFileId] = useState("f1");
  const [buildState, setBuildState] = useState<AppState["buildState"]>("building");
  const [previewState, setPreviewState] = useState<AppState["previewState"]>("offline");
  const [workflowIndex, setWorkflowIndex] = useState(2);
  const [lastPrompt, setLastPrompt] = useState("Add a clean project switcher and wire it to recent workspaces");
  const [agentRequesting, setAgentRequesting] = useState(false);
  const [taskText, setTaskText] = useState("");
  const [chatMessages, setChatMessages] = useState(welcomeMessages);
  const [newFilePath, setNewFilePath] = useState("note.txt");
  const [command, setCommand] = useState("npm run build");

  const derived: AppDerivedState = useMemo(() => {
    const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];
    const selectedFile = files.find((file) => file.id === selectedFileId) ?? files[0] ?? emptyFile;
    return {
      selectedProject,
      selectedFile,
      activeAgents: agents.filter((agent) => agent.state === "running" || agent.state === "waiting"),
      latestOutput: logs[0]?.message ?? "No output yet"
    };
  }, [agents, files, logs, projects, selectedFileId, selectedProjectId]);

  return {
    state: {
      authenticated, authMode, authName, authEmail, authPassword,
      paired, agentUrl, pairCode, pairing, pairingError, pairingMessage,
      healthMessage, checkingHealth, pendingPhoneApproval, connection,
      machineName, projects, selectedProjectId, selectedModel, reasoningEffort,
      agents, logs, files, changes, selectedFileId, buildState, previewState,
      workflowIndex, lastPrompt, agentRequesting, taskText, chatMessages,
      newFilePath, command
    },
    derived,
    setters: {
      setAuthenticated, setAuthMode, setAuthName, setAuthEmail, setAuthPassword,
      setPaired, setAgentUrl, setPairCode, setPairing, setPairingError,
      setPairingMessage, setHealthMessage, setCheckingHealth,
      setPendingPhoneApproval, setConnection, setMachineName, setProjects,
      setSelectedProjectId, setSelectedModel, setReasoningEffort, setAgents,
      setLogs, setFiles, setChanges, setSelectedFileId, setBuildState,
      setPreviewState, setWorkflowIndex, setLastPrompt, setAgentRequesting,
      setTaskText, setChatMessages, setNewFilePath, setCommand
    }
  };
}
