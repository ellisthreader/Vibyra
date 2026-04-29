import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  NativeModules,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets
} from "react-native-safe-area-context";

type TabKey = "home" | "projects" | "agents" | "files" | "settings";
type AgentState = "running" | "waiting" | "complete" | "failed";
type BuildState = "idle" | "building" | "passed" | "failed";
type ModelKey = "OpenAI" | "Claude" | "Gemini";
type PreviewState = "offline" | "live" | "refreshing" | "delivered";
type WorkflowStepKey =
  | "installAgent"
  | "backendConnected"
  | "mobileOpened"
  | "paired"
  | "projectSelected"
  | "previewStarted"
  | "promptSent"
  | "modelCalled"
  | "diffReturned"
  | "agentApplied"
  | "projectReloaded"
  | "previewCaptured"
  | "previewDelivered";

type Project = {
  id: string;
  name: string;
  path: string;
  stack: string;
  updated: string;
};

type Agent = {
  id: string;
  title: string;
  model: ModelKey;
  projectId: string;
  state: AgentState;
  progress: number;
  file: string;
};

type LogEvent = {
  id: string;
  source: string;
  message: string;
  tone: "info" | "success" | "warning" | "error";
  time: string;
};

type FileEntry = {
  id: string;
  name: string;
  path: string;
  language: string;
  changed: "added" | "modified" | "clean";
  body: string;
};

type WorkflowStep = {
  key: WorkflowStepKey;
  title: string;
  detail: string;
};

type CodeChange = {
  id: string;
  file: string;
  summary: string;
  additions: number;
  deletions: number;
  status: "pending" | "applied";
};

type AgentConnection = {
  url: string;
  token: string;
  machineName: string;
};

type PairApprovalPayload = {
  url: string;
  token: string;
  machineName: string;
  projects: Project[];
  events: LogEvent[];
};

type TabDefinition = {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const tabs: TabDefinition[] = [
  { key: "home", label: "Home", icon: "home-outline" },
  { key: "projects", label: "Projects", icon: "folder-open-outline" },
  { key: "agents", label: "Agents", icon: "sparkles-outline" },
  { key: "files", label: "Files", icon: "document-text-outline" },
  { key: "settings", label: "Settings", icon: "settings-outline" }
];

const models: ModelKey[] = ["OpenAI", "Claude", "Gemini"];

const workflowSteps: WorkflowStep[] = [
  {
    key: "installAgent",
    title: "PC Agent Ready",
    detail: "User installs the separate desktop agent"
  },
  {
    key: "backendConnected",
    title: "Backend Connected",
    detail: "Agent signs into the Code X backend"
  },
  {
    key: "mobileOpened",
    title: "Mobile Open",
    detail: "iPhone becomes the command center"
  },
  {
    key: "paired",
    title: "Phone Paired",
    detail: "Secure device trust is established"
  },
  {
    key: "projectSelected",
    title: "Project Selected",
    detail: "User chooses a folder exposed by the PC"
  },
  {
    key: "previewStarted",
    title: "Preview Live",
    detail: "Project preview stream starts"
  },
  {
    key: "promptSent",
    title: "Prompt Sent",
    detail: "Task is sent from phone to backend"
  },
  {
    key: "modelCalled",
    title: "AI Model",
    detail: "Backend routes the task to the chosen model"
  },
  {
    key: "diffReturned",
    title: "Diff Returned",
    detail: "Generated code changes are ready"
  },
  {
    key: "agentApplied",
    title: "Applied Locally",
    detail: "PC agent applies the diff to disk"
  },
  {
    key: "projectReloaded",
    title: "Project Reloaded",
    detail: "Dev server refreshes the workspace"
  },
  {
    key: "previewCaptured",
    title: "Preview Captured",
    detail: "Agent captures the updated app"
  },
  {
    key: "previewDelivered",
    title: "Phone Updated",
    detail: "Preview is delivered back to iPhone"
  }
];

const starterProjects: Project[] = [
  {
    id: "p1",
    name: "LaunchPad SaaS",
    path: "~/Desktop/SaaS",
    stack: "Next.js, Stripe, Supabase",
    updated: "2 min ago"
  },
  {
    id: "p2",
    name: "Founders CRM",
    path: "~/Code/founders-crm",
    stack: "React Native, API",
    updated: "Yesterday"
  },
  {
    id: "p3",
    name: "Edge Billing",
    path: "~/Work/edge-billing",
    stack: "Node, Postgres",
    updated: "Apr 20"
  }
];

const starterAgents: Agent[] = [
  {
    id: "a1",
    title: "Build login flow",
    model: "OpenAI",
    projectId: "p1",
    state: "running",
    progress: 68,
    file: "app/(auth)/login.tsx"
  },
  {
    id: "a2",
    title: "Run tests and fix failures",
    model: "Claude",
    projectId: "p1",
    state: "waiting",
    progress: 42,
    file: "tests/billing.spec.ts"
  }
];

const starterLogs: LogEvent[] = [
  {
    id: "l1",
    source: "Code X",
    message: "Paired with Taylor-MBP",
    tone: "success",
    time: "Now"
  },
  {
    id: "l2",
    source: "OpenAI",
    message: "Updated auth form validation",
    tone: "info",
    time: "1m"
  },
  {
    id: "l3",
    source: "Build",
    message: "Typecheck running",
    tone: "warning",
    time: "2m"
  }
];

const starterFiles: FileEntry[] = [
  {
    id: "f1",
    name: "login.tsx",
    path: "app/(auth)/login.tsx",
    language: "tsx",
    changed: "modified",
    body:
      "export function LoginScreen() {\n  return <AuthForm mode=\"login\" />;\n}\n"
  },
  {
    id: "f2",
    name: "billing.spec.ts",
    path: "tests/billing.spec.ts",
    language: "ts",
    changed: "modified",
    body:
      "test('creates a checkout session', async () => {\n  await expect(createSession()).resolves.toBeDefined();\n});\n"
  },
  {
    id: "f3",
    name: "agent-events.ts",
    path: "lib/agent-events.ts",
    language: "ts",
    changed: "added",
    body:
      "export type AgentEvent = {\n  id: string;\n  message: string;\n  createdAt: string;\n};\n"
  }
];

const starterChanges: CodeChange[] = [
  {
    id: "d1",
    file: "app/(dashboard)/project-switcher.tsx",
    summary: "Add workspace switcher for recent folders",
    additions: 84,
    deletions: 12,
    status: "applied"
  },
  {
    id: "d2",
    file: "lib/agent-workflow.ts",
    summary: "Track prompt, diff, reload, and preview delivery states",
    additions: 46,
    deletions: 4,
    status: "applied"
  }
];

const quickCommands = [
  "git status",
  "npm run build",
  "npm test",
  "pytest",
  "npm run dev"
];

const colors = {
  background: "#0A0A0A",
  surface: "#111111",
  elevated: "#161616",
  border: "#1F1F1F",
  borderStrong: "#2B2B2B",
  text: "#FFFFFF",
  muted: "#A1A1AA",
  dim: "#71717A",
  accent: "#3B82F6",
  accentSoft: "rgba(59, 130, 246, 0.14)",
  success: "#22C55E",
  successSoft: "rgba(34, 197, 94, 0.13)",
  warning: "#F59E0B",
  warningSoft: "rgba(245, 158, 11, 0.14)",
  error: "#EF4444",
  errorSoft: "rgba(239, 68, 68, 0.13)"
};

function impact(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
  void Haptics.impactAsync(style).catch(() => undefined);
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function normalizeAgentUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("http://") || trimmed.startsWith("https://")
    ? trimmed
    : `http://${trimmed}`;
}

function getDefaultAgentUrl() {
  const scriptUrl = NativeModules.SourceCode?.scriptURL as string | undefined;
  const hostMatch = scriptUrl?.match(/https?:\/\/([^/:]+)/);
  return hostMatch ? `http://${hostMatch[1]}:4317` : "http://127.0.0.1:4317";
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function AppRoot() {
  const [paired, setPaired] = useState(false);
  const [agentUrl, setAgentUrl] = useState(getDefaultAgentUrl);
  const [pairCode, setPairCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [pairingError, setPairingError] = useState("");
  const [pairingMessage, setPairingMessage] = useState("Open Code X Desktop and type the code shown there.");
  const [pendingPhoneApproval, setPendingPhoneApproval] = useState<PairApprovalPayload | null>(null);
  const [connection, setConnection] = useState<AgentConnection | null>(null);
  const [machineName, setMachineName] = useState("Desktop agent");
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [projects, setProjects] = useState<Project[]>(starterProjects);
  const [selectedProjectId, setSelectedProjectId] = useState("p1");
  const [selectedModel, setSelectedModel] = useState<ModelKey>("OpenAI");
  const [agents, setAgents] = useState<Agent[]>(starterAgents);
  const [logs, setLogs] = useState<LogEvent[]>(starterLogs);
  const [files, setFiles] = useState<FileEntry[]>(starterFiles);
  const [changes, setChanges] = useState<CodeChange[]>(starterChanges);
  const [selectedFileId, setSelectedFileId] = useState("f1");
  const [buildState, setBuildState] = useState<BuildState>("building");
  const [previewState, setPreviewState] = useState<PreviewState>("offline");
  const [workflowIndex, setWorkflowIndex] = useState(2);
  const [lastPrompt, setLastPrompt] = useState("Add a clean project switcher and wire it to recent workspaces");
  const [commandSheetOpen, setCommandSheetOpen] = useState(false);
  const [agentSheetOpen, setAgentSheetOpen] = useState(false);
  const [taskText, setTaskText] = useState("Add a clean project switcher and wire it to recent workspaces");
  const [command, setCommand] = useState("npm run build");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const selectedFile = files.find((file) => file.id === selectedFileId) ?? files[0];
  const activeAgents = agents.filter((agent) => agent.state === "running" || agent.state === "waiting");

  const latestOutput = logs[0]?.message ?? "No output yet";

  useEffect(() => {
    if (!connection) return undefined;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const result = await agentRequest<{
          events: LogEvent[];
          preview: { state: PreviewState } | null;
          selectedProjectId: string | null;
        }>("/events");

        if (cancelled) return;
        setLogs(result.events);
        if (result.preview?.state) {
          setPreviewState(result.preview.state);
        }
        if (result.selectedProjectId) {
          setSelectedProjectId(result.selectedProjectId);
        }
      } catch {
        if (!cancelled) {
          appendLog("Live desktop updates paused", "Desktop", "warning");
        }
      }
    }, 2200);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connection]);

  async function agentRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    useAuth = true
  ): Promise<T> {
    const baseUrl = normalizeAgentUrl(connection?.url ?? agentUrl);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> | undefined)
    };

    if (useAuth && connection?.token) {
      headers.Authorization = `Bearer ${connection.token}`;
    }

    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.error ?? "Desktop agent request failed");
    }

    return payload as T;
  }

  function appendLog(message: string, source = "Code X", tone: LogEvent["tone"] = "info") {
    setLogs((current) => [
      {
        id: makeId("log"),
        source,
        message,
        tone,
        time: "Now"
      },
      ...current.slice(0, 20)
    ]);
  }

  function appendLogs(nextLogs: Omit<LogEvent, "id" | "time">[]) {
    setLogs((current) => [
      ...nextLogs.map((log) => ({
        id: makeId("log"),
        time: "Now",
        ...log
      })),
      ...current.slice(0, 20)
    ]);
  }

  function advanceWorkflow(index: number) {
    setWorkflowIndex((current) => Math.max(current, index));
  }

  async function pairMachine() {
    const nextUrl = normalizeAgentUrl(agentUrl);
    const nextCode = pairCode.trim().toUpperCase();
    if (!nextUrl || nextCode.length < 4) {
      setPairingError("Enter the code shown in Code X Desktop.");
      return;
    }

    setPairing(true);
    setPairingError("");
    setPairingMessage("Asking Code X Desktop for permission...");

    try {
      const request = await agentRequest<{
        status: "pending" | "approved";
        requestId?: string;
        token: string;
        machineName: string;
        projects: Project[];
        events: LogEvent[];
      }>(
        "/pair",
        {
          method: "POST",
          body: JSON.stringify({
            code: nextCode,
            deviceName: "Code X iPhone"
          })
        },
        false
      );

      const result =
        request.status === "pending" && request.requestId
          ? await waitForDesktopApproval(request.requestId)
          : request;

      setPendingPhoneApproval({
        url: nextUrl,
        token: result.token,
        machineName: result.machineName,
        projects: result.projects,
        events: result.events
      });
      setPairingMessage("Desktop approved. Allow this phone to control your coding machine.");
      impact(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pairing failed";
      setPairingError(`${message}. Make sure Code X Desktop is open on the same Wi-Fi.`);
      setPairingMessage("Open Code X Desktop and type the code shown there.");
    } finally {
      setPairing(false);
    }
  }

  async function waitForDesktopApproval(requestId: string) {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await wait(1000);
      setPairingMessage("Waiting for you to press Allow on the desktop...");
      const result = await agentRequest<{
        status: "pending" | "approved" | "denied";
        token: string;
        machineName: string;
        projects: Project[];
        events: LogEvent[];
      }>(`/pair/status?requestId=${encodeURIComponent(requestId)}`, {}, false);

      if (result.status === "approved") return result;
      if (result.status === "denied") throw new Error("Desktop denied pairing.");
    }

    throw new Error("Pairing timed out. Try the code again.");
  }

  function confirmPhonePermission() {
    if (!pendingPhoneApproval) return;

    const result = pendingPhoneApproval;
    setConnection({
      url: result.url,
      token: result.token,
      machineName: result.machineName
    });
    setMachineName(result.machineName);
    if (result.projects.length > 0) {
      setProjects(result.projects);
      setSelectedProjectId(result.projects[0].id);
    }
    if (result.events.length > 0) {
      setLogs(result.events);
    }
    setAgentUrl(result.url);
    setPendingPhoneApproval(null);
    setPaired(true);
    advanceWorkflow(3);
    appendLog(`Secure session established with ${result.machineName}`, "Pairing", "success");
    impact(Haptics.ImpactFeedbackStyle.Medium);
  }

  function createProject() {
    const nextProject: Project = {
      id: makeId("project"),
      name: "Untitled Workspace",
      path: "~/Code/untitled-workspace",
      stack: "New project",
      updated: "Now"
    };
    impact();
    setProjects((current) => [nextProject, ...current]);
    setSelectedProjectId(nextProject.id);
    setPreviewState("live");
    advanceWorkflow(5);
    setActiveTab("projects");
    appendLogs([
      {
        source: "Preview",
        message: "Live preview started for Untitled Workspace",
        tone: "success"
      },
      {
        source: "Projects",
        message: "Created Untitled Workspace",
        tone: "success"
      }
    ]);
  }

  async function selectProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    impact();
    setSelectedProjectId(projectId);
    setPreviewState("live");
    advanceWorkflow(5);
    appendLogs([
      {
        source: "Preview",
        message: `Live preview started for ${project?.name ?? "project"}`,
        tone: "success"
      },
      {
        source: "Projects",
        message: `Selected ${project?.path ?? "project folder"}`,
        tone: "info"
      }
    ]);

    if (!connection) return;

    try {
      const result = await agentRequest<{ preview: { state: PreviewState }; events: LogEvent[] }>(
        "/preview/start",
        {
          method: "POST",
          body: JSON.stringify({ projectId })
        }
      );
      setPreviewState(result.preview.state);
      appendLogs(result.events);
    } catch (error) {
      appendLog(error instanceof Error ? error.message : "Preview failed", "Desktop Agent", "error");
    }
  }

  async function startAgent() {
    const trimmed = taskText.trim();
    if (!trimmed) return;

    const optimisticAgent: Agent = {
      id: makeId("agent"),
      title: trimmed,
      model: selectedModel,
      projectId: selectedProject.id,
      state: "running",
      progress: 12,
      file: "backend/orchestration"
    };

    impact(Haptics.ImpactFeedbackStyle.Medium);
    setAgents((current) => [optimisticAgent, ...current]);
    setBuildState("building");
    setPreviewState("refreshing");
    setLastPrompt(trimmed);
    setAgentSheetOpen(false);
    setActiveTab("agents");

    if (!connection) {
      finishDemoAgent(optimisticAgent, trimmed);
      return;
    }

    try {
      const result = await agentRequest<{
        agent: Agent;
        changes: CodeChange[];
        files: FileEntry[];
        events: LogEvent[];
        preview: { state: PreviewState };
        buildState: BuildState;
      }>("/agents/start", {
        method: "POST",
        body: JSON.stringify({
          projectId: selectedProject.id,
          prompt: trimmed,
          model: selectedModel
        })
      });

      setAgents((current) =>
        current.map((agent) => (agent.id === optimisticAgent.id ? result.agent : agent))
      );
      setBuildState(result.buildState);
      setPreviewState(result.preview.state);
      setChanges(result.changes);
      setFiles((current) => [...result.files, ...current]);
      advanceWorkflow(12);
      appendLogs(result.events);
    } catch (error) {
      setAgents((current) =>
        current.map((agent) =>
          agent.id === optimisticAgent.id ? { ...agent, state: "failed", progress: 100 } : agent
        )
      );
      setBuildState("failed");
      setPreviewState("live");
      appendLog(error instanceof Error ? error.message : "Agent task failed", "Desktop Agent", "error");
    }
  }

  function finishDemoAgent(agent: Agent, prompt: string) {
    setAgents((current) =>
      current.map((item) =>
        item.id === agent.id
          ? { ...item, state: "complete", progress: 100, file: "app/(dashboard)/project-switcher.tsx" }
          : item
      )
    );
    setBuildState("passed");
    setPreviewState("delivered");
    setChanges([
      {
        id: makeId("diff"),
        file: "app/(dashboard)/project-switcher.tsx",
        summary: "Adds the requested mobile-driven project switcher",
        additions: 96,
        deletions: 18,
        status: "applied"
      }
    ]);
    appendLogs([
      { source: "Preview", message: "Updated preview delivered to iPhone", tone: "success" },
      { source: "Agent", message: `Demo agent completed: ${prompt}`, tone: "success" }
    ]);
    advanceWorkflow(12);
  }

  async function runCommand(value = command) {
    const trimmed = value.trim();
    if (!trimmed) return;

    impact();
    setCommand(trimmed);
    appendLog(`Running ${trimmed}`, "Terminal", "warning");
    setBuildState(trimmed.includes("test") || trimmed.includes("build") ? "building" : buildState);
    setCommandSheetOpen(false);

    if (!connection) return;

    try {
      const result = await agentRequest<{
        ok: boolean;
        output: string;
        event: LogEvent;
        buildState: BuildState;
      }>("/commands/run", {
        method: "POST",
        body: JSON.stringify({
          projectId: selectedProject.id,
          command: trimmed
        })
      });
      setBuildState(result.buildState);
      appendLog(result.output.slice(0, 220), "Terminal", result.ok ? "success" : "error");
    } catch (error) {
      setBuildState("failed");
      appendLog(error instanceof Error ? error.message : "Command failed", "Terminal", "error");
    }
  }

  function stopAgent(agentId: string) {
    impact();
    setAgents((current) =>
      current.map((agent) =>
        agent.id === agentId ? { ...agent, state: "complete", progress: 100 } : agent
      )
    );
    appendLog("Agent stopped by user", "Agents", "warning");
  }

  function restartAgent(agent: Agent) {
    impact();
    setAgents((current) =>
      current.map((item) =>
        item.id === agent.id ? { ...item, state: "running", progress: 4 } : item
      )
    );
    setBuildState("building");
    appendLog(`Restarted: ${agent.title}`, agent.model, "info");
  }

  if (!paired) {
    return (
      <Onboarding
        onConfirmPhonePermission={confirmPhonePermission}
        onPair={pairMachine}
        pairCode={pairCode}
        onPairCodeChange={setPairCode}
        pendingPhoneApproval={pendingPhoneApproval}
        pairing={pairing}
        pairingError={pairingError}
        pairingMessage={pairingMessage}
      />
    );
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <View style={styles.content}>
          {activeTab === "home" && (
            <HomeScreen
              activeAgents={activeAgents}
              buildState={buildState}
              machineName={machineName}
              latestOutput={latestOutput}
              logs={logs}
              onCreateProject={createProject}
              onOpenAgentSheet={() => setAgentSheetOpen(true)}
              onOpenCommandSheet={() => setCommandSheetOpen(true)}
              project={selectedProject}
              previewState={previewState}
              lastPrompt={lastPrompt}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              workflowIndex={workflowIndex}
            />
          )}

          {activeTab === "projects" && (
            <ProjectsScreen
              onCreateProject={createProject}
              projects={projects}
              previewState={previewState}
              selectedProjectId={selectedProject.id}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              setSelectedProjectId={selectProject}
            />
          )}

          {activeTab === "agents" && (
            <AgentsScreen
              agents={agents}
              projects={projects}
              selectedProject={selectedProject}
              onOpenAgentSheet={() => setAgentSheetOpen(true)}
              onRestartAgent={restartAgent}
              onStopAgent={stopAgent}
            />
          )}

          {activeTab === "files" && (
            <FilesScreen
              files={files}
              changes={changes}
              selectedFile={selectedFile}
              selectedFileId={selectedFile.id}
              setSelectedFileId={(fileId) => {
                impact();
                setSelectedFileId(fileId);
              }}
            />
          )}

          {activeTab === "settings" && (
            <SettingsScreen
              notificationsEnabled={notificationsEnabled}
              setNotificationsEnabled={setNotificationsEnabled}
              machineName={machineName}
              agentUrl={connection?.url ?? agentUrl}
              onRevoke={() => {
                impact(Haptics.ImpactFeedbackStyle.Medium);
                setPaired(false);
                setConnection(null);
                setPreviewState("offline");
              }}
            />
          )}
        </View>

        <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />
      </KeyboardAvoidingView>

      <CommandSheet
        command={command}
        open={commandSheetOpen}
        onClose={() => setCommandSheetOpen(false)}
        onCommandChange={setCommand}
        onRun={runCommand}
      />

      <AgentSheet
        open={agentSheetOpen}
        onClose={() => setAgentSheetOpen(false)}
        onStart={startAgent}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        taskText={taskText}
        setTaskText={setTaskText}
        project={selectedProject}
        previewState={previewState}
      />
    </SafeAreaView>
  );
}

function Onboarding({
  onConfirmPhonePermission,
  onPair,
  pairCode,
  onPairCodeChange,
  pendingPhoneApproval,
  pairing,
  pairingError,
  pairingMessage
}: {
  onConfirmPhonePermission: () => void;
  onPair: () => void;
  pairCode: string;
  onPairCodeChange: (code: string) => void;
  pendingPhoneApproval: PairApprovalPayload | null;
  pairing: boolean;
  pairingError: string;
  pairingMessage: string;
}) {
  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="light" />
      <View style={styles.onboarding}>
        <View style={styles.brandMark}>
          <Ionicons name="terminal-outline" color={colors.text} size={28} />
        </View>
        <Text style={styles.brandName}>Code X</Text>
        <Text style={styles.promise}>Your coding machine, anywhere.</Text>

        <View style={styles.pairPanel}>
          <View style={styles.prereqRow}>
            <Ionicons name="desktop-outline" color={colors.success} size={19} />
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>Open Code X Desktop</Text>
              <Text style={styles.rowMeta}>{pairingMessage}</Text>
            </View>
          </View>

          <View style={styles.qrFrame}>
            <View style={styles.qrGrid}>
              {Array.from({ length: 25 }).map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.qrCell,
                    index % 2 === 0 || [6, 8, 16, 18, 22].includes(index)
                      ? styles.qrCellActive
                      : null
                  ]}
                />
              ))}
            </View>
          </View>

          <TextInput
            value={pairCode}
            onChangeText={(value) => onPairCodeChange(value.toUpperCase())}
            placeholder="Pair code"
            placeholderTextColor={colors.dim}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            style={[styles.input, styles.pairInput, styles.pairCodeInput]}
          />

          <View style={styles.pairCodeRow}>
            {(pairCode || "------").padEnd(6, "-").slice(0, 6).split("").map((char, index) => (
              <View key={`${char}-${index}`} style={styles.pairCodeCell}>
                <Text style={styles.pairCodeText}>{char === "-" ? "" : char}</Text>
              </View>
            ))}
          </View>

          {pairingError ? <Text style={styles.errorText}>{pairingError}</Text> : null}

          {pendingPhoneApproval ? (
            <View style={styles.phonePermission}>
              <Ionicons name="shield-checkmark-outline" color={colors.success} size={22} />
              <Text style={styles.rowTitle}>Allow {pendingPhoneApproval.machineName}?</Text>
              <Text style={styles.rowMeta}>
                This desktop can show projects, receive prompts, run approved commands, and send live updates.
              </Text>
              <PrimaryButton
                icon="checkmark-circle-outline"
                label="Allow Desktop"
                onPress={onConfirmPhonePermission}
              />
            </View>
          ) : (
            <PrimaryButton
              icon="link-outline"
              label={pairing ? "Waiting for desktop..." : "Pair iPhone"}
              onPress={onPair}
            />
          )}

        </View>

        <View style={styles.onboardingFooter}>
          <Ionicons name="shield-checkmark-outline" color={colors.success} size={18} />
          <Text style={styles.mutedText}>Trusted devices only via backend pairing</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function HomeScreen({
  activeAgents,
  buildState,
  lastPrompt,
  latestOutput,
  logs,
  machineName,
  onCreateProject,
  onOpenAgentSheet,
  onOpenCommandSheet,
  project,
  previewState,
  selectedModel,
  setSelectedModel,
  workflowIndex
}: {
  activeAgents: Agent[];
  buildState: BuildState;
  lastPrompt: string;
  latestOutput: string;
  logs: LogEvent[];
  machineName: string;
  onCreateProject: () => void;
  onOpenAgentSheet: () => void;
  onOpenCommandSheet: () => void;
  project: Project;
  previewState: PreviewState;
  selectedModel: ModelKey;
  setSelectedModel: (model: ModelKey) => void;
  workflowIndex: number;
}) {
  return (
    <Screen title="Home" eyebrow={`${machineName} online`}>
      <View style={styles.machineBand}>
        <View>
          <View style={styles.inline}>
            <StatusDot color={colors.success} />
            <Text style={styles.machineTitle}>Connected</Text>
          </View>
          <Text style={styles.machineMeta}>{project.name}</Text>
        </View>
        <StatusPill tone={buildState === "failed" ? "error" : buildState === "passed" ? "success" : "info"}>
          {buildState}
        </StatusPill>
      </View>

      <View style={styles.metricGrid}>
        <MetricTile label="Agents" value={String(activeAgents.length)} icon="sparkles-outline" />
        <MetricTile label="Build" value={buildState === "building" ? "Live" : buildState} icon="hammer-outline" />
        <MetricTile label="Output" value="Now" icon="pulse-outline" />
      </View>

      <WorkflowCard activeIndex={workflowIndex} />

      <PreviewPanel
        lastPrompt={lastPrompt}
        previewState={previewState}
        project={project}
      />

      <ComposerCard
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        onStart={onOpenAgentSheet}
      />

      <View style={styles.actionGrid}>
        <ActionButton icon="terminal-outline" label="Command" onPress={onOpenCommandSheet} />
        <ActionButton icon="folder-outline" label="New Project" onPress={onCreateProject} />
      </View>

      <SectionHeader title="Latest Output" action="Live" />
      <View style={styles.outputPanel}>
        <Text style={styles.outputText}>{latestOutput}</Text>
      </View>

      <SectionHeader title="Activity" />
      <ActivityFeed logs={logs} />
    </Screen>
  );
}

function ProjectsScreen({
  onCreateProject,
  previewState,
  projects,
  selectedProjectId,
  selectedModel,
  setSelectedModel,
  setSelectedProjectId
}: {
  onCreateProject: () => void;
  previewState: PreviewState;
  projects: Project[];
  selectedProjectId: string;
  selectedModel: ModelKey;
  setSelectedModel: (model: ModelKey) => void;
  setSelectedProjectId: (projectId: string) => void;
}) {
  return (
    <Screen title="Projects" eyebrow="Recent workspaces">
      <PrimaryButton icon="add-outline" label="New Project" onPress={onCreateProject} />

      <SectionHeader title="Model" />
      <SegmentedControl selected={selectedModel} values={models} onChange={setSelectedModel} />

      <SectionHeader title="Recent" />
      <View style={styles.listStack}>
        {projects.map((project) => (
          <Pressable
            key={project.id}
            onPress={() => setSelectedProjectId(project.id)}
            style={[
              styles.projectRow,
              project.id === selectedProjectId ? styles.projectRowActive : null
            ]}
          >
            <View style={styles.projectIcon}>
              <Ionicons name="folder-open-outline" color={colors.text} size={20} />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>{project.name}</Text>
              <Text style={styles.rowMeta}>{project.stack}</Text>
              <Text style={styles.rowDim}>{project.path}</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowDim}>
                {project.id === selectedProjectId
                  ? previewState === "offline"
                    ? "Selected"
                    : "Preview live"
                  : project.updated}
              </Text>
              {project.id === selectedProjectId && (
                <Ionicons name="checkmark-circle" color={colors.accent} size={20} />
              )}
            </View>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

function AgentsScreen({
  agents,
  projects,
  selectedProject,
  onOpenAgentSheet,
  onRestartAgent,
  onStopAgent
}: {
  agents: Agent[];
  projects: Project[];
  selectedProject: Project;
  onOpenAgentSheet: () => void;
  onRestartAgent: (agent: Agent) => void;
  onStopAgent: (agentId: string) => void;
}) {
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects]
  );

  return (
    <Screen title="Agents" eyebrow={selectedProject.name}>
      <PrimaryButton icon="sparkles-outline" label="Start Agent" onPress={onOpenAgentSheet} />

      <SectionHeader title="Running" />
      <View style={styles.listStack}>
        {agents.map((agent) => (
          <View key={agent.id} style={styles.agentCard}>
            <View style={styles.agentHeader}>
              <View style={styles.agentIcon}>
                <Ionicons name="sparkles-outline" color={colors.text} size={19} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowTitle}>{agent.title}</Text>
                <Text style={styles.rowMeta}>
                  {agent.model} in {projectById.get(agent.projectId) ?? "Project"}
                </Text>
              </View>
              <StatusPill tone={agent.state === "failed" ? "error" : agent.state === "complete" ? "success" : agent.state === "waiting" ? "warning" : "info"}>
                {agent.state}
              </StatusPill>
            </View>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${agent.progress}%` }]} />
            </View>

            <View style={styles.agentFooter}>
              <Text style={styles.rowDim}>{agent.file}</Text>
              <View style={styles.iconActions}>
                <IconButton
                  icon="refresh-outline"
                  label="Restart"
                  onPress={() => onRestartAgent(agent)}
                />
                <IconButton
                  icon="stop-outline"
                  label="Stop"
                  onPress={() => onStopAgent(agent.id)}
                />
              </View>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

function FilesScreen({
  changes,
  files,
  selectedFile,
  selectedFileId,
  setSelectedFileId
}: {
  changes: CodeChange[];
  files: FileEntry[];
  selectedFile: FileEntry;
  selectedFileId: string;
  setSelectedFileId: (fileId: string) => void;
}) {
  return (
    <Screen title="Files" eyebrow="Workspace changes">
      <SectionHeader title="Generated Diff" action="Applied" />
      <DiffSummary changes={changes} />

      <SectionHeader title="Files" />
      <View style={styles.filePicker}>
        {files.map((file) => (
          <Pressable
            key={file.id}
            onPress={() => setSelectedFileId(file.id)}
            style={[styles.fileChip, file.id === selectedFileId ? styles.fileChipActive : null]}
          >
            <Ionicons
              name={file.changed === "added" ? "add-circle-outline" : "document-text-outline"}
              color={file.id === selectedFileId ? colors.text : colors.muted}
              size={16}
            />
            <Text style={[styles.fileChipText, file.id === selectedFileId ? styles.text : null]}>
              {file.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.fileHeader}>
        <View>
          <Text style={styles.rowTitle}>{selectedFile.path}</Text>
          <Text style={styles.rowMeta}>{selectedFile.language}</Text>
        </View>
        <StatusPill tone={selectedFile.changed === "added" ? "success" : selectedFile.changed === "modified" ? "warning" : "info"}>
          {selectedFile.changed}
        </StatusPill>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.codePanel}
        contentContainerStyle={styles.codeContent}
      >
        <Text style={styles.codeText}>{selectedFile.body}</Text>
      </ScrollView>
    </Screen>
  );
}

function SettingsScreen({
  agentUrl,
  machineName,
  notificationsEnabled,
  setNotificationsEnabled,
  onRevoke
}: {
  agentUrl: string;
  machineName: string;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  onRevoke: () => void;
}) {
  return (
    <Screen title="Settings" eyebrow="Device control">
      <View style={styles.settingsGroup}>
        <SettingsRow
          icon="person-circle-outline"
          title="Account"
          meta="taylor@codex.local"
        />
        <SettingsRow
          icon="desktop-outline"
          title="Paired Machine"
          meta={machineName}
          status="online"
        />
        <SettingsRow
          icon="link-outline"
          title="Agent URL"
          meta={agentUrl}
        />
        <View style={styles.settingsRow}>
          <View style={styles.settingsIcon}>
            <Ionicons name="notifications-outline" color={colors.text} size={19} />
          </View>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>Notifications</Text>
            <Text style={styles.rowMeta}>Builds, failures, approvals</Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={(enabled) => {
              impact();
              setNotificationsEnabled(enabled);
            }}
            trackColor={{ false: colors.borderStrong, true: colors.accent }}
            thumbColor={colors.text}
          />
        </View>
      </View>

      <TouchableOpacity style={styles.revokeButton} onPress={onRevoke} activeOpacity={0.82}>
        <Ionicons name="close-circle-outline" color={colors.error} size={20} />
        <Text style={styles.revokeText}>Revoke Access</Text>
      </TouchableOpacity>
    </Screen>
  );
}

function Screen({
  children,
  eyebrow,
  title
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
      {children}
    </ScrollView>
  );
}

function WorkflowCard({ activeIndex }: { activeIndex: number }) {
  return (
    <View style={styles.workflowCard}>
      <View style={styles.workflowHeader}>
        <View>
          <Text style={styles.cardEyebrow}>Workflow</Text>
          <Text style={styles.cardTitle}>Agent loop</Text>
        </View>
        <StatusPill tone={activeIndex >= workflowSteps.length - 1 ? "success" : "info"}>
          {activeIndex >= workflowSteps.length - 1 ? "ready" : "live"}
        </StatusPill>
      </View>

      <View style={styles.workflowList}>
        {workflowSteps.map((step, index) => {
          const done = index < activeIndex;
          const current = index === activeIndex;
          return (
            <View key={step.key} style={styles.workflowRow}>
              <View
                style={[
                  styles.workflowNode,
                  done ? styles.workflowNodeDone : null,
                  current ? styles.workflowNodeCurrent : null
                ]}
              >
                <Ionicons
                  name={done ? "checkmark" : current ? "radio-button-on" : "ellipse-outline"}
                  color={done || current ? colors.text : colors.dim}
                  size={13}
                />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.workflowTitle}>{step.title}</Text>
                <Text style={styles.rowMeta}>{step.detail}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function PreviewPanel({
  lastPrompt,
  previewState,
  project
}: {
  lastPrompt: string;
  previewState: PreviewState;
  project: Project;
}) {
  const live = previewState !== "offline";

  return (
    <View style={styles.previewPanel}>
      <View style={styles.previewTopBar}>
        <View style={styles.inline}>
          <StatusDot color={live ? colors.success : colors.dim} />
          <Text style={styles.previewTitle}>{live ? "Live Preview" : "Preview Waiting"}</Text>
        </View>
        <Text style={styles.rowDim}>{previewState}</Text>
      </View>

      <View style={styles.previewViewport}>
        <View style={styles.previewNav}>
          <View style={styles.previewDot} />
          <View style={styles.previewDot} />
          <View style={styles.previewDot} />
          <Text style={styles.previewUrl}>localhost:3000/{project.name.toLowerCase().replace(/\s/g, "-")}</Text>
        </View>
        <View style={styles.previewBody}>
          <Text style={styles.previewHero}>{project.name}</Text>
          <Text style={styles.previewCopy}>
            {live
              ? "Latest capture from the paired PC agent is synced to this phone."
              : "Select a project folder to start the stream."}
          </Text>
          <View style={styles.previewCallout}>
            <Ionicons name="sparkles-outline" color={colors.accent} size={16} />
            <Text style={styles.previewCalloutText}>{lastPrompt}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function DiffSummary({ changes }: { changes: CodeChange[] }) {
  return (
    <View style={styles.diffPanel}>
      {changes.map((change) => (
        <View key={change.id} style={styles.diffRow}>
          <View style={styles.diffIcon}>
            <Ionicons name="git-compare-outline" color={colors.text} size={18} />
          </View>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>{change.file}</Text>
            <Text style={styles.rowMeta}>{change.summary}</Text>
            <Text style={styles.diffStats}>
              +{change.additions} / -{change.deletions}
            </Text>
          </View>
          <StatusPill tone={change.status === "applied" ? "success" : "warning"}>
            {change.status}
          </StatusPill>
        </View>
      ))}
    </View>
  );
}

function ComposerCard({
  selectedModel,
  setSelectedModel,
  onStart
}: {
  selectedModel: ModelKey;
  setSelectedModel: (model: ModelKey) => void;
  onStart: () => void;
}) {
  return (
    <View style={styles.composerPanel}>
      <Text style={styles.composerTitle}>Launch task</Text>
      <SegmentedControl selected={selectedModel} values={models} onChange={setSelectedModel} />
      <PrimaryButton icon="arrow-up-circle-outline" label="Start Agent" onPress={onStart} />
    </View>
  );
}

function CommandSheet({
  command,
  open,
  onClose,
  onCommandChange,
  onRun
}: {
  command: string;
  open: boolean;
  onClose: () => void;
  onCommandChange: (command: string) => void;
  onRun: (command?: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Run Command">
      <TextInput
        value={command}
        onChangeText={onCommandChange}
        placeholder="npm run build"
        placeholderTextColor={colors.dim}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      <View style={styles.commandChips}>
        {quickCommands.map((item) => (
          <Pressable key={item} style={styles.commandChip} onPress={() => onRun(item)}>
            <Text style={styles.commandChipText}>{item}</Text>
          </Pressable>
        ))}
      </View>
      <PrimaryButton icon="play-outline" label="Run" onPress={() => onRun(command)} />
    </Sheet>
  );
}

function AgentSheet({
  open,
  onClose,
  onStart,
  project,
  previewState,
  selectedModel,
  setSelectedModel,
  taskText,
  setTaskText
}: {
  open: boolean;
  onClose: () => void;
  onStart: () => void;
  project: Project;
  previewState: PreviewState;
  selectedModel: ModelKey;
  setSelectedModel: (model: ModelKey) => void;
  taskText: string;
  setTaskText: (task: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Start Agent">
      <View style={styles.sheetContext}>
        <View style={styles.inline}>
          <StatusDot color={previewState === "offline" ? colors.warning : colors.success} />
          <Text style={styles.rowTitle}>{project.name}</Text>
        </View>
        <Text style={styles.rowMeta}>
          Prompt will route backend to AI model, then return a diff for the PC agent to apply.
        </Text>
      </View>
      <SegmentedControl selected={selectedModel} values={models} onChange={setSelectedModel} />
      <TextInput
        value={taskText}
        onChangeText={setTaskText}
        placeholder="Describe the task"
        placeholderTextColor={colors.dim}
        multiline
        style={[styles.input, styles.taskInput]}
      />
      <PrimaryButton icon="sparkles-outline" label="Launch" onPress={onStart} />
    </Sheet>
  );
}

function Sheet({
  children,
  open,
  onClose,
  title
}: {
  children: React.ReactNode;
  open: boolean;
  onClose: () => void;
  title: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <IconButton icon="close-outline" label="Close" onPress={onClose} />
        </View>
        {children}
      </View>
    </Modal>
  );
}

function ActivityFeed({ logs }: { logs: LogEvent[] }) {
  return (
    <View style={styles.feed}>
      {logs.map((log) => (
        <View key={log.id} style={styles.logRow}>
          <View style={[styles.logDot, { backgroundColor: toneColor(log.tone) }]} />
          <View style={styles.rowContent}>
            <Text style={styles.logMessage}>{log.message}</Text>
            <Text style={styles.rowMeta}>{log.source}</Text>
          </View>
          <Text style={styles.rowDim}>{log.time}</Text>
        </View>
      ))}
    </View>
  );
}

function TabBar({
  activeTab,
  setActiveTab
}: {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            onPress={() => {
              impact();
              setActiveTab(tab.key);
            }}
            style={styles.tabItem}
          >
            <Ionicons
              name={active ? activeIcon(tab.icon) : tab.icon}
              color={active ? colors.text : colors.dim}
              size={22}
            />
            <Text style={[styles.tabLabel, active ? styles.tabLabelActive : null]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PrimaryButton({
  icon,
  label,
  onPress
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.primaryButton} onPress={onPress} activeOpacity={0.86}>
      <Ionicons name={icon} color={colors.text} size={19} />
      <Text style={styles.primaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

function ActionButton({
  icon,
  label,
  onPress
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.actionButton} onPress={onPress} activeOpacity={0.86}>
      <Ionicons name={icon} color={colors.text} size={20} />
      <Text style={styles.actionText}>{label}</Text>
    </TouchableOpacity>
  );
}

function IconButton({
  icon,
  label,
  onPress
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityLabel={label} hitSlop={8} onPress={onPress} style={styles.iconButton}>
      <Ionicons name={icon} color={colors.text} size={18} />
    </Pressable>
  );
}

function SegmentedControl<T extends string>({
  selected,
  values,
  onChange
}: {
  selected: T;
  values: T[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {values.map((value) => {
        const active = value === selected;
        return (
          <Pressable
            key={value}
            onPress={() => {
              impact();
              onChange(value);
            }}
            style={[styles.segment, active ? styles.segmentActive : null]}
          >
            <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>
              {value}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MetricTile({
  icon,
  label,
  value
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metricTile}>
      <Ionicons name={icon} color={colors.muted} size={18} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function SettingsRow({
  icon,
  title,
  meta,
  status
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  meta: string;
  status?: string;
}) {
  return (
    <View style={styles.settingsRow}>
      <View style={styles.settingsIcon}>
        <Ionicons name={icon} color={colors.text} size={19} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowMeta}>{meta}</Text>
      </View>
      {status && <StatusPill tone="success">{status}</StatusPill>}
    </View>
  );
}

function SectionHeader({ title, action }: { title: string; action?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && <Text style={styles.sectionAction}>{action}</Text>}
    </View>
  );
}

function StatusPill({
  children,
  tone
}: {
  children: string;
  tone: "info" | "success" | "warning" | "error";
}) {
  return (
    <View style={[styles.statusPill, { backgroundColor: toneBackground(tone) }]}>
      <Text style={[styles.statusPillText, { color: toneColor(tone) }]}>{children}</Text>
    </View>
  );
}

function StatusDot({ color }: { color: string }) {
  return <View style={[styles.statusDot, { backgroundColor: color }]} />;
}

function activeIcon(icon: keyof typeof Ionicons.glyphMap) {
  return icon.replace("-outline", "") as keyof typeof Ionicons.glyphMap;
}

function toneColor(tone: LogEvent["tone"]) {
  if (tone === "success") return colors.success;
  if (tone === "warning") return colors.warning;
  if (tone === "error") return colors.error;
  return colors.accent;
}

function toneBackground(tone: LogEvent["tone"]) {
  if (tone === "success") return colors.successSoft;
  if (tone === "warning") return colors.warningSoft;
  if (tone === "error") return colors.errorSoft;
  return colors.accentSoft;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppRoot />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 9,
    height: 52,
    justifyContent: "center"
  },
  actionGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12
  },
  actionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700"
  },
  agentCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14
  },
  agentFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginTop: 12
  },
  agentHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  agentIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  backdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.62)",
    flex: 1
  },
  brandMark: {
    alignItems: "center",
    backgroundColor: colors.elevated,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    height: 58,
    justifyContent: "center",
    width: 58
  },
  brandName: {
    color: colors.text,
    fontSize: 42,
    fontWeight: "800",
    letterSpacing: 0,
    marginTop: 18
  },
  cardEyebrow: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 3
  },
  codeContent: {
    padding: 16
  },
  codePanel: {
    backgroundColor: "#050505",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    minHeight: 260
  },
  codeText: {
    color: "#E5E7EB",
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    fontSize: 13,
    lineHeight: 22
  },
  demoButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    marginTop: 8,
    width: "100%"
  },
  demoButtonText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "800"
  },
  detectedText: {
    color: colors.dim,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 10,
    textAlign: "center"
  },
  diffIcon: {
    alignItems: "center",
    backgroundColor: colors.elevated,
    borderRadius: 8,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  diffPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1
  },
  diffRow: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14
  },
  diffStats: {
    color: colors.success,
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    fontSize: 12,
    fontWeight: "800",
    marginTop: 7
  },
  commandChip: {
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  commandChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 18,
    marginTop: 12
  },
  commandChipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600"
  },
  composerPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    marginTop: 16,
    padding: 14
  },
  composerTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800"
  },
  content: {
    flex: 1
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center"
  },
  feed: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8
  },
  fileChip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 10
  },
  fileChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent
  },
  fileChipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  fileHeader: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    padding: 14
  },
  filePicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  header: {
    marginBottom: 18,
    paddingTop: 6
  },
  iconActions: {
    flexDirection: "row",
    gap: 8
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  inline: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  input: {
    backgroundColor: colors.elevated,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  keyboard: {
    flex: 1
  },
  listStack: {
    gap: 10,
    marginTop: 8
  },
  logDot: {
    borderRadius: 4,
    height: 8,
    marginTop: 7,
    width: 8
  },
  logMessage: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600"
  },
  logRow: {
    alignItems: "flex-start",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14
  },
  machineBand: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16
  },
  machineMeta: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 5
  },
  machineTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "800"
  },
  metricGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12
  },
  metricLabel: {
    color: colors.dim,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3
  },
  metricTile: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 96,
    padding: 12
  },
  metricValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 13
  },
  mutedText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600"
  },
  onboarding: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 22
  },
  onboardingFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 18
  },
  outputPanel: {
    backgroundColor: "#050505",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14
  },
  outputText: {
    color: colors.text,
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    fontSize: 13,
    lineHeight: 20
  },
  pairCodeCell: {
    alignItems: "center",
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 38
  },
  pairCodeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
    marginTop: 12
  },
  pairCodeInput: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center"
  },
  pairCodeText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800"
  },
  pairPanel: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 34,
    padding: 20
  },
  pairInput: {
    alignSelf: "stretch",
    marginTop: 12,
    width: "100%"
  },
  phonePermission: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    marginTop: 4,
    padding: 14
  },
  prereqRow: {
    alignItems: "center",
    alignSelf: "stretch",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
    paddingBottom: 16
  },
  previewBody: {
    gap: 12,
    padding: 16
  },
  previewCallout: {
    alignItems: "flex-start",
    backgroundColor: colors.accentSoft,
    borderColor: "rgba(59, 130, 246, 0.22)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 12
  },
  previewCalloutText: {
    color: colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19
  },
  previewCopy: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19
  },
  previewDot: {
    backgroundColor: colors.borderStrong,
    borderRadius: 4,
    height: 8,
    width: 8
  },
  previewHero: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0
  },
  previewNav: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 12
  },
  previewPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    overflow: "hidden"
  },
  previewTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800"
  },
  previewTopBar: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14
  },
  previewUrl: {
    color: colors.dim,
    flex: 1,
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    fontSize: 11,
    fontWeight: "700"
  },
  previewViewport: {
    backgroundColor: "#050505",
    minHeight: 210
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    height: 52,
    justifyContent: "center",
    width: "100%"
  },
  primaryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800"
  },
  progressFill: {
    backgroundColor: colors.accent,
    borderRadius: 4,
    height: "100%"
  },
  progressTrack: {
    backgroundColor: colors.border,
    borderRadius: 4,
    height: 8,
    marginTop: 14,
    overflow: "hidden"
  },
  projectIcon: {
    alignItems: "center",
    backgroundColor: colors.elevated,
    borderRadius: 8,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  projectRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 13
  },
  projectRowActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent
  },
  promise: {
    color: colors.muted,
    fontSize: 18,
    fontWeight: "600",
    marginTop: 8,
    textAlign: "center"
  },
  qrCell: {
    borderRadius: 2,
    height: 14,
    width: 14
  },
  qrCellActive: {
    backgroundColor: colors.text
  },
  qrFrame: {
    alignItems: "center",
    backgroundColor: colors.text,
    borderRadius: 8,
    height: 112,
    justifyContent: "center",
    width: 112
  },
  qrGrid: {
    backgroundColor: colors.background,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    height: 86,
    padding: 5,
    width: 86
  },
  revokeButton: {
    alignItems: "center",
    borderColor: colors.error,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    height: 52,
    justifyContent: "center",
    marginTop: 16
  },
  revokeText: {
    color: colors.error,
    fontSize: 15,
    fontWeight: "800"
  },
  rowContent: {
    flex: 1,
    minWidth: 0
  },
  rowDim: {
    color: colors.dim,
    fontSize: 12,
    fontWeight: "600"
  },
  rowMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 3
  },
  rowRight: {
    alignItems: "flex-end",
    gap: 8
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800"
  },
  screen: {
    flex: 1
  },
  screenContent: {
    paddingBottom: 26,
    paddingHorizontal: 18,
    paddingTop: 10
  },
  sectionAction: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "800"
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    marginTop: 22
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800"
  },
  segment: {
    alignItems: "center",
    borderRadius: 7,
    flex: 1,
    height: 38,
    justifyContent: "center"
  },
  segmentActive: {
    backgroundColor: colors.elevated
  },
  segmented: {
    backgroundColor: "#070707",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    padding: 4
  },
  segmentText: {
    color: colors.dim,
    fontSize: 13,
    fontWeight: "800"
  },
  segmentTextActive: {
    color: colors.text
  },
  settingsGroup: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1
  },
  settingsIcon: {
    alignItems: "center",
    backgroundColor: colors.elevated,
    borderRadius: 8,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  settingsRow: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 70,
    padding: 14
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopColor: colors.borderStrong,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    bottom: 0,
    gap: 14,
    left: 0,
    padding: 18,
    position: "absolute",
    right: 0
  },
  sheetHandle: {
    alignSelf: "center",
    backgroundColor: colors.borderStrong,
    borderRadius: 3,
    height: 5,
    width: 44
  },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  sheetContext: {
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800"
  },
  shell: {
    backgroundColor: colors.background,
    flex: 1
  },
  statusDot: {
    borderRadius: 5,
    height: 10,
    width: 10
  },
  statusPill: {
    alignItems: "center",
    borderRadius: 8,
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "capitalize"
  },
  tabBar: {
    backgroundColor: "rgba(10, 10, 10, 0.97)",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingTop: 8
  },
  tabItem: {
    alignItems: "center",
    flex: 1,
    gap: 4,
    minHeight: 52,
    justifyContent: "center"
  },
  tabLabel: {
    color: colors.dim,
    fontSize: 10,
    fontWeight: "800"
  },
  tabLabelActive: {
    color: colors.text
  },
  taskInput: {
    minHeight: 116,
    textAlignVertical: "top"
  },
  text: {
    color: colors.text
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 0,
    marginTop: 4
  },
  workflowCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 14
  },
  workflowHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  workflowList: {
    gap: 10,
    marginTop: 16
  },
  workflowNode: {
    alignItems: "center",
    backgroundColor: colors.elevated,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    height: 26,
    justifyContent: "center",
    width: 26
  },
  workflowNodeCurrent: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  workflowNodeDone: {
    backgroundColor: colors.success,
    borderColor: colors.success
  },
  workflowRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10
  },
  workflowTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800"
  }
});
