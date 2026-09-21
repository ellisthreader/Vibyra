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
async function closeChat(id: string): Promise<void> {
  await chatRequest("session.stop", { sessionId: id });
  const terminals = useConversationTerminals.getState();
  terminals.dismiss(id);
  await terminals.refresh();
}

const storeDeps: RequestDeps = {
  agents,
  // The phone's page is the chat itself, so what it asks for is the Chat route:
  // Claude and Gemini go through the conversation engine like Codex, whatever
  // Agent view this Mac keeps for its own panes.
  launch: (agent, projectId, title) => launchConfigured(agent, projectId, { title, view: "chat" }),
  approvalPending: () => useLaunchApprovalStore.getState().pending !== null,
  closePane: (id) => useTerminalStore.getState().close(id),
  closeChat,
  rename: async (projectId, name) => {
    const renamed = await useProjectStore.getState().rename(projectId, name);
    return renamed ? { id: renamed.id, name: renamed.name, path: renamed.root } : null;
  },
  // The Mac's own Remove project: it leaves the list and its terminals close.
  // The folder stays exactly where it is.
  forget: (projectId) => useProjectStore.getState().remove(projectId),
  adopt: async (path, name) => {
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
