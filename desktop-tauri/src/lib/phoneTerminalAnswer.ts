import { computerName } from "./platform.ts";
import type { PhoneProjectOpened, PhoneTerminalRequest, PhoneTerminalStarted } from "../ipc/phone";
import type { LaunchedSession } from "./configuredLaunch";
import type { ResolvedAgent } from "../types";

// How a phone's request is answered, kept apart from the stores that carry it
// out (`phoneTerminalRequests.ts`) so the decisions can be tested on their own.

/** What answering leans on. */
export interface RequestDeps {
  models: () => Promise<import("./phoneTerminalModels").PhoneTerminalModel[]>;
  agents: () => Promise<ResolvedAgent[]>;
  /** Why the last launch started nothing, when the Mac said. */
  lastError?: () => string | null;
  launch: (agent: ResolvedAgent, projectId: string, title: string, safeMode?: boolean, requestId?: string, model?: import("./phoneTerminalModels").PhoneTerminalModel, permissionMode?: "standard" | "full") => Promise<LaunchedSession[]>;
  /** Whether a Safe mode checkpoint is waiting on the person right now. */
  approvalPending: () => boolean;
  closePane: (id: number) => Promise<void>;
  closeChat: (id: string) => Promise<void>;
  /** Opens a folder as a project here, exactly as the person's own New project does. */
  adopt: (path: string, name: string) => Promise<PhoneProjectOpened | null>;
  /** Renames a project in this window's list. The folder keeps its own name. */
  rename: (projectId: string, name: string) => Promise<PhoneProjectOpened | null>;
  /** Drops a project from this window's list. Nothing on disk is deleted. */
  forget: (projectId: string) => Promise<void>;
  accountDefaults?: () => Record<string, string>;
  accountDefault?: (provider: string, account: string) => void;
}

export type Reply = { result?: PhoneTerminalStarted | PhoneProjectOpened | { ok: true } | Record<string, string> | { models: import("./phoneTerminalModels").PhoneTerminalModel[]; permissionModes: ["standard", "full"]; effortSelection?: boolean }; error?: string };

const AGENT_NAMES: Record<string, string> = { shell: "Terminal", codex: "Codex", claude: "Claude Code" };

export const APPROVAL_WAITING =
  `Safe mode is waiting for a checkpoint to be approved on your ${computerName}. Approve it there, then find the terminal here.`;

export async function answerTerminalRequest(request: Exclude<PhoneTerminalRequest, { action: 'focusedText' }>, deps: RequestDeps): Promise<Reply> {
  try {
    if (request.action === "accountDefaults") return { result: deps.accountDefaults?.() ?? {} };
    if (request.action === "accountDefault") {
      if (!deps.accountDefault) return { error: "Open Vibyra on your Mac to choose an account." };
      deps.accountDefault(request.provider, request.account);
      return { result: { ok: true } };
    }
    if (request.action === "models") return { result: { models: await deps.models(), permissionModes: ["standard", "full"], effortSelection: true } };
    if (request.action === "adopt") {
      const project = await deps.adopt(request.path, request.name);
      // The folder is built either way; what failed is it appearing in the list.
      if (!project) return { error: "Vibyra could not open the new folder as a project." };
      return { result: project };
    }
    if (request.action === "rename") {
      const project = await deps.rename(request.projectId, request.name);
      if (!project) return { error: `That project is not open on this ${computerName}.` };
      return { result: project };
    }
    if (request.action === "forget") {
      await deps.forget(request.projectId);
      return { result: { ok: true } };
    }
    if (request.action === "close") {
      if (request.conversationId) await deps.closeChat(request.conversationId);
      else if (typeof request.paneId === "number") await deps.closePane(request.paneId);
      else return { error: "Nothing to close" };
      return { result: { ok: true } };
    }
    const agent = (await deps.agents()).find((candidate) => candidate.id === request.kind);
    if (!agent) return { error: `${AGENT_NAMES[request.kind] ?? request.kind} is not available on this ${computerName}.` };
    if (!agent.installed && agent.id !== "shell") return { error: `${agent.name} is not installed on this ${computerName}.` };
    if (!["shell", "codex", "claude"].includes(request.kind) && !request.model)
      return { error: "Choose an available model for this terminal runner." };
    let selected = request.model ? (await deps.models()).find(model => model.id === request.model && model.kind === request.kind) : undefined;
    if (request.model && !selected) return { error: "That model is no longer available on this computer. Refresh the model list and choose again." };
    if (request.effort !== undefined) {
      if (!selected || (request.effort !== null ? !selected.efforts?.includes(request.effort) : !!selected.efforts?.length))
        return { error: "That effort is not supported by the selected model. Refresh and choose again." };
      selected = { ...selected, effort: request.effort };
    }
    if (request.permissionMode !== undefined &&
      (request.kind === "shell" || !["standard", "full"].includes(request.permissionMode)))
      return { error: "Choose Standard or Full permissions for an AI terminal." };
    if (request.permissionMode === "full" && !["codex", "claude", "gemini"].includes(request.kind))
      return { error: "Full permissions are not supported by this AI runner." };
    // Older phones omit this field. A phone launch always defaults to the
    // project folder, regardless of this Mac's saved Launch setup.
    const [started] = await deps.launch(agent, request.projectId, request.title, request.safeMode === true, request.requestId, selected, request.permissionMode);
    if (started) return { result: started };
    // An approval for another launch must never turn this phone's explicit
    // Safe mode off request into a Safe mode error.
    if (request.safeMode === true && deps.approvalPending()) return { error: APPROVAL_WAITING };
    // The launch's own reason, such as a model this account is not offered, goes
    // to the phone as the Mac said it; otherwise the short of it and where to look.
    return { error: deps.lastError?.() ?? `The terminal did not start. Check Vibyra on your ${computerName}.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
