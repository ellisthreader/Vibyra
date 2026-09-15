import type { PhoneProjectOpened, PhoneTerminalRequest, PhoneTerminalStarted } from "../ipc/phone";
import type { LaunchedSession } from "./configuredLaunch";
import type { ResolvedAgent } from "../types";

// How a phone's request is answered, kept apart from the stores that carry it
// out (`phoneTerminalRequests.ts`) so the decisions can be tested on their own.

/** What answering leans on. */
export interface RequestDeps {
  agents: () => Promise<ResolvedAgent[]>;
  launch: (agent: ResolvedAgent, projectId: string, title: string) => Promise<LaunchedSession[]>;
  /** Whether a Safe mode checkpoint is waiting on the person right now. */
  approvalPending: () => boolean;
  closePane: (id: number) => Promise<void>;
  closeChat: (id: string) => Promise<void>;
  /** Opens a folder as a project here, exactly as the person's own New project does. */
  adopt: (path: string, name: string) => Promise<PhoneProjectOpened | null>;
}

export type Reply = { result?: PhoneTerminalStarted | PhoneProjectOpened | { ok: true }; error?: string };

const AGENT_NAMES: Record<string, string> = { shell: "Terminal", codex: "Codex", claude: "Claude Code" };

export const APPROVAL_WAITING =
  "Safe mode is waiting for a checkpoint to be approved on your Mac. Approve it there, then find the terminal here.";

export async function answerTerminalRequest(request: PhoneTerminalRequest, deps: RequestDeps): Promise<Reply> {
  try {
    if (request.action === "adopt") {
      const project = await deps.adopt(request.path, request.name);
      // The folder is built either way; what failed is it appearing in the list.
      if (!project) return { error: "Vibyra could not open the new folder as a project." };
      return { result: project };
    }
    if (request.action === "close") {
      if (request.conversationId) await deps.closeChat(request.conversationId);
      else if (typeof request.paneId === "number") await deps.closePane(request.paneId);
      else return { error: "Nothing to close" };
      return { result: { ok: true } };
    }
    const agent = (await deps.agents()).find((candidate) => candidate.id === request.kind);
    if (!agent) return { error: `${AGENT_NAMES[request.kind] ?? request.kind} is not available on this Mac.` };
    if (!agent.installed && agent.id !== "shell") return { error: `${agent.name} is not installed on this Mac.` };
    const [started] = await deps.launch(agent, request.projectId, request.title);
    if (started) return { result: started };
    if (deps.approvalPending()) return { error: APPROVAL_WAITING };
    // The launch's own reason went to the Mac's notifications; the phone gets
    // the short of it and where to look.
    return { error: "The terminal did not start. Check Vibyra on your Mac." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
