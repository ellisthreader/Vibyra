import { Agent, CodeChange, FileEntry, LogEvent, ModelKey, Project, ReasoningEffort } from "../types/domain";

export const DESKTOP_RELAY_URL = process.env.EXPO_PUBLIC_DESKTOP_RELAY_URL ?? "";
export const models: ModelKey[] = ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5-codex"];
export const reasoningEfforts: ReasoningEffort[] = ["none", "low", "medium", "high", "xhigh"];

export const starterProjects: Project[] = [
  {
    id: "p1",
    name: "LaunchPad SaaS",
    path: "~/Desktop/SaaS",
    stack: "Next.js, Stripe, Supabase",
    updated: "2 min ago",
    source: "mobile"
  },
  {
    id: "p2",
    name: "Founders CRM",
    path: "~/Code/founders-crm",
    stack: "React Native, API",
    updated: "Yesterday",
    source: "mobile"
  },
  {
    id: "p3",
    name: "Edge Billing",
    path: "~/Work/edge-billing",
    stack: "Node, Postgres",
    updated: "Apr 20",
    source: "mobile"
  }
];

export const starterAgents: Agent[] = [
  {
    id: "a1",
    title: "Build login flow",
    model: "gpt-5.5",
    projectId: "p1",
    state: "running",
    progress: 68,
    file: "app/(auth)/login.tsx"
  },
  {
    id: "a2",
    title: "Run tests and fix failures",
    model: "gpt-5.4",
    projectId: "p1",
    state: "waiting",
    progress: 42,
    file: "tests/billing.spec.ts"
  }
];

export const starterLogs: LogEvent[] = [
  { id: "l1", source: "Vibyra", message: "Paired with Taylor-MBP", tone: "success", time: "Now" },
  { id: "l2", source: "Vibyra Agent", message: "Updated auth form validation", tone: "info", time: "1m" },
  { id: "l3", source: "Build", message: "Typecheck running", tone: "warning", time: "2m" }
];

export const starterFiles: FileEntry[] = [
  {
    id: "f1",
    name: "login.tsx",
    path: "app/(auth)/login.tsx",
    language: "tsx",
    changed: "modified",
    body: "export function LoginScreen() {\n  return <AuthForm mode=\"login\" />;\n}\n"
  },
  {
    id: "f2",
    name: "billing.spec.ts",
    path: "tests/billing.spec.ts",
    language: "ts",
    changed: "modified",
    body: "test('creates a checkout session', async () => {\n  await expect(createSession()).resolves.toBeDefined();\n});\n"
  },
  {
    id: "f3",
    name: "agent-events.ts",
    path: "lib/agent-events.ts",
    language: "ts",
    changed: "added",
    body: "export type AgentEvent = {\n  id: string;\n  message: string;\n  createdAt: string;\n};\n"
  }
];

export const starterChanges: CodeChange[] = [
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
