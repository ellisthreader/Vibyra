import { usePlanPromptStore } from "../state/planPromptStore";
import { phoneProjectMutation } from "./phoneProjectMutation";
import { invoke } from '@tauri-apps/api/core';
import { resolveLaunchAccount } from './resolveLaunchAccount';
import { phoneModelAccounts } from './phoneModelAccounts';
import { useProviderAccountStore } from '../state/providerAccountStore';
import type { AccountModel } from './phoneAccountModels';
import { useProviderDefaultStore } from "../state/providerDefaultStore";
import { useModelCatalogStore } from "../state/modelCatalogStore";
import { useSettingsStore } from "../state/settingsStore";
import { phoneTerminalModels } from "./phoneTerminalModels";
import type { LaunchEffort } from "../state/launchSettingsStore";
import { listen } from "@tauri-apps/api/event";

import { chatRequest } from "../ipc/sharedChats";
import { phoneTerminalReply, phoneTerminalRequests, type PhoneTerminalRequest } from "../ipc/phone";
import { useAgentStore } from "../state/agentStore";
import { useConversationTerminals } from "../state/conversationTerminalStore";
import { useLaunchApprovalStore } from "../state/launchApprovalStore";
import { useProjectStore } from "../state/projectStore";
import { useTerminalStore } from "../state/terminalStore";
import { launchConfigured } from "./configuredLaunch";
import { answerTerminalRequest, type RequestDeps } from "./phoneTerminalAnswer";
import { useNotificationStore } from "../state/notificationStore";
import type { ResolvedAgent } from "../types";

// A phone paired to this Mac can ask for a terminal in a project, or for one
// to close. Rust holds the request and waits; this window is what knows how
// a terminal is launched here (the project's Launch setup: account, model,
// safe mode) and how a card comes down, so the request is answered with the
// very same actions the person's own clicks run.

async function agents(): Promise<ResolvedAgent[]> {
  const store = useAgentStore.getState();
  if (!store.loaded) await store.refresh();
  return useAgentStore.getState().agents;
}

/** The Mac's own Close terminal for a shared chat: the engine session ends
 * and the card comes down, on both screens. */
async function closeChat(id: string, phoneRequestId?: string): Promise<void> {
  await chatRequest("session.stop", { sessionId: id }, phoneRequestId);
  const terminals = useConversationTerminals.getState();
  terminals.dismiss(id);
  await terminals.refresh();
}

let launchProblem: string | null = null;

const storeDeps: RequestDeps = {
  authorize: (id) => invoke("phone_request_authorize", { id }),
  accountDefaults: () => useProviderDefaultStore.getState().byRuntime,
  accountDefault: async (provider, account, phoneRequestId) => {
    await invoke("phone_preference_authorize", { id: phoneRequestId, provider, account });
    useProviderDefaultStore.getState().setDefault(provider, account);
  },
  agents,
  models: async (phoneRequestId) => {
    // The Mac already has a usable live/cache/static catalogue. Network refresh
    // must never hold the encrypted request open beyond its 15-second deadline.
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([useModelCatalogStore.getState().refresh(),
        new Promise<void>(resolve => { timeout = setTimeout(resolve, 3000); })]);
    } finally { clearTimeout(timeout); }
    await useProviderAccountStore.getState().refresh();
    const advertised = await phoneModelAccounts(useProviderAccountStore.getState().providers,
      resolveLaunchAccount, (provider, accountId) => invoke<{ data: AccountModel[] }>('shared_chat_account_models', { provider, accountId, phoneRequestId }));
    return phoneTerminalModels(useModelCatalogStore.getState().fullGroups, await agents(),
      useSettingsStore.getState().settings?.enabledAgentIds ?? [], advertised);
  },
  // The phone's page is the chat itself, so what it asks for is the Chat route:
  // Claude and Gemini go through the conversation engine like Codex, whatever
  // Agent view this Mac keeps for its own panes.
  launch: async (agent, projectId, title, safeMode, requestId, selected, permissionMode, phoneRequestId) => {
    // A failed launch reports on this Mac as a notification; keep its words for the phone.
    const since = Math.max(0, ...useNotificationStore.getState().history.map(item => item.id));
    const limitsBefore = usePlanPromptStore.getState().seq;
    const started = await launchConfigured(agent, projectId, {
      title, view: "chat", safeMode, requestId, phoneRequestId,
      ...(permissionMode ? { permissionMode } : {}),
      ...(selected ? { model: selected.model, reasoningEnabled: selected.effort !== null,
        reasoningEffort: selected.effort as LaunchEffort | undefined } : {}),
    });
    const limit = usePlanPromptStore.getState();
    // A plan limit keeps its marker, so the phone offers Pro rather than an error.
    launchProblem = started.length ? null : limit.seq !== limitsBefore && limit.last
      ? `plan-limit:${limit.last.feature}: ${limit.last.message}`
      : useNotificationStore.getState().history
        .find(item => item.id > since && item.category === "system" && item.severity === "danger")?.body ?? null;
    return started;
  },
  lastError: () => launchProblem,
  approvalPending: () => useLaunchApprovalStore.getState().pending !== null,
  resumeSaved: async (id, projectId, phoneRequestId) => {
    const store = useTerminalStore.getState();
    if (id >= 0 || !store.panes.some(pane => pane.id === id && pane.projectId === projectId && pane.status === 'suspended'))
      throw new Error('This saved terminal is no longer available.');
    const resumed = await store.resume(id, phoneRequestId);
    if (typeof resumed !== 'number') throw new Error(useTerminalStore.getState().relaunchErrors[id] || 'The terminal did not resume.');
    return resumed;
  },
  closePane: (id, phoneRequestId) => useTerminalStore.getState().close(id, phoneRequestId),
  closeChat,
  rename: async (projectId, name, phoneRequestId) => {
    if (phoneRequestId) return phoneProjectMutation(phoneRequestId, "rename");
    const renamed = await useProjectStore.getState().rename(projectId, name);
    return renamed ? { id: renamed.id, name: renamed.name, path: renamed.root } : null;
  },
  // The Mac's own Remove project: it leaves the list and its terminals close.
  // The folder stays exactly where it is.
  forget: async (projectId, phoneRequestId) => {
    if (phoneRequestId) { await phoneProjectMutation(phoneRequestId, "forget"); return; }
    await useProjectStore.getState().remove(projectId);
  },
  adopt: async (path, name, phoneRequestId) => {
    if (phoneRequestId) return phoneProjectMutation(phoneRequestId, "adopt");
    const project = await useProjectStore.getState().create(path, name);
    // The phone's folder list is keyed the way this window publishes it.
    return project ? { id: project.id, name: project.name, path: project.root } : null;
  },
};

export function startPhoneTerminalRequests(): () => void {
  const answered = new Set<string>();
  const answer = async (request: PhoneTerminalRequest) => {
    if (answered.has(request.id)) return;
    answered.add(request.id);
    const reply = await answerTerminalRequest(request, storeDeps);
    await phoneTerminalReply(request.id, reply).catch(() => {});
  };
  // Anything asked before this listener existed — a request that arrived
  // while the window was still loading — is picked up here.
  void phoneTerminalRequests().then((pending) => pending.forEach((request) => void answer(request))).catch(() => {});
  const unlisten = listen<PhoneTerminalRequest>("phone:terminal-request", (event) => void answer(event.payload));
  return () => {
    void unlisten.then((off) => off());
  };
}
