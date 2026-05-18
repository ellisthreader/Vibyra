import { FileEntry, LogEvent } from "../types/domain";
import { dedupeFiles } from "../utils/files";
import { AgentStartResult } from "./agentTypes";
import { previewAppForAgentResult } from "./agentPreviewHelpers";
import { useAppState } from "./useAppState";

type Store = ReturnType<typeof useAppState>;
type Requests = {
  agentRequest: <T>(endpoint: string, options?: RequestInit, useAuth?: boolean) => Promise<T>;
};
type Logs = {
  appendLog: (message: string, source?: string, tone?: "info" | "success" | "warning" | "error") => void;
  appendLogs: (logs: Omit<LogEvent, "id" | "time">[]) => void;
};
type Workspace = {
  undoCodeChange: (projectId: string, messageId: string, changeId: string, file: FileEntry) => Promise<void>;
};

export function useEditPermissionActions(store: Store, requests: Requests, logs: Logs, workspace: Workspace) {
  const { state, setters } = store;

  async function approveEdits(messageId: string, projectId: string, alwaysAllow: boolean) {
    const message = state.chatThreads[projectId]?.find((m) => m.id === messageId);
    const pendingApplyId = message?.pendingApplyId;

    if (pendingApplyId && state.connection) {
      const applied = await applyPendingEdits(messageId, projectId, pendingApplyId);
      if (!applied) return;
      if (alwaysAllow) setAlwaysAllow(projectId);
      return;
    }

    setters.setChatThreads((current) => {
      const thread = current[projectId];
      if (!thread) return current;
      return {
        ...current,
        [projectId]: thread.map((message) => (
          message.id === messageId ? { ...message, editApproval: "allowed" } : message
        ))
      };
    });
    if (alwaysAllow) setAlwaysAllow(projectId);
  }

  async function denyEdits(messageId: string, projectId: string) {
    const message = state.chatThreads[projectId]?.find((m) => m.id === messageId);
    if (message?.pendingApplyId && state.connection) {
      try {
        await requests.agentRequest("/agents/discard", {
          method: "POST",
          body: JSON.stringify({ runId: message.pendingApplyId })
        });
      } catch (error) {
        logs.appendLog(error instanceof Error ? error.message : "Could not discard pending edits", "Edit Permission", "warning");
      }
    }
    markDenied(messageId, projectId, message?.pendingApplyId);
    if (message?.pendingApplyId) return;
    const files = message?.codeFiles ?? [];
    for (const change of message?.codeChanges ?? []) {
      const file = findChangedFile(files, change.file);
      if (file && file.previousBody !== undefined && file.previousBody !== null) {
        await workspace.undoCodeChange(projectId, messageId, change.id, file);
      }
    }
  }

  async function applyPendingEdits(messageId: string, projectId: string, pendingApplyId: string) {
    try {
      const result = await requests.agentRequest<AgentStartResult>("/agents/apply", {
        method: "POST",
        body: JSON.stringify({ runId: pendingApplyId })
      });
      setters.setAgents((current) => current.map((agent) => (agent.id === result.agent.id ? result.agent : agent)));
      setters.setBuildState(result.buildState);
      setters.setPreviewState(result.preview.state);
      setters.setChanges(result.changes);
      setters.setFiles((current) => dedupeFiles([...result.files, ...current]));
      logs.appendLogs(result.events);
      markAllowed(messageId, projectId, pendingApplyId, result);
      return true;
    } catch (error) {
      logs.appendLog(error instanceof Error ? error.message : "Could not apply pending edits", "Edit Permission", "error");
      return false;
    }
  }

  function markAllowed(messageId: string, projectId: string, pendingApplyId: string, result: AgentStartResult) {
    const project = state.chatProjects[projectId] ?? state.projects.find((item) => item.id === projectId);
    const app = previewAppForAgentResult(state.connection, projectId, project?.name ?? "Preview", result);
    setters.setChatThreads((current) => {
      const thread = current[projectId];
      if (!thread) return current;
      return {
        ...current,
        [projectId]: thread.map((item) => {
          if (item.id !== messageId && item.pendingApplyId !== pendingApplyId) return item;
          const { pendingApplyId: _pendingApplyId, ...rest } = item;
          return { ...rest, codeChanges: result.changes, codeFiles: result.files, editApproval: "allowed", ...(app ? { app } : {}) };
        })
      };
    });
  }

  function markDenied(messageId: string, projectId: string, pendingApplyId?: string) {
    setters.setChatThreads((current) => {
      const thread = current[projectId];
      if (!thread) return current;
      return {
        ...current,
        [projectId]: thread.map((message) => {
          if (message.id !== messageId && (!pendingApplyId || message.pendingApplyId !== pendingApplyId)) return message;
          const { pendingApplyId: _pendingApplyId, ...rest } = message;
          return { ...rest, editApproval: "denied" };
        })
      };
    });
  }

  function setAlwaysAllow(projectId: string) {
    setters.setEditApprovals((current) => ({ ...current, [projectId]: "always" }));
  }

  return { approveEdits, denyEdits };
}

function findChangedFile(files: FileEntry[], path: string) {
  return files.find((file) => file.path === path || file.name === path.split("/").pop() || path.endsWith(`/${file.path}`));
}
