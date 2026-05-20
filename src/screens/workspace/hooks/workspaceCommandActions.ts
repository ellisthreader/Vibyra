import type { MutableRefObject } from "react";
import type { GeneratedApp, Project } from "../../../types/domain";
import type { WorkspaceState } from "./useWorkspaceState";
import { useWorkspaceChatRuntime } from "./workspaceChatRuntime";
import {
  commandOutputReply,
  isTerminalApproval,
  isTerminalDenial,
  needsTerminalApproval
} from "./workspaceTerminalCommands";

type Runtime = ReturnType<typeof useWorkspaceChatRuntime>;
type ReplyFn = (reply: string, project?: Project, preview?: GeneratedApp) => void;

type CommandActionDeps = {
  pendingPreviewServerRef: MutableRefObject<{ projectId: string; messageId: string } | null>;
  pendingTerminalRef: MutableRefObject<{ command: string; projectId: string } | null>;
  promptForDesktopConnection: (prompt: string, query: string, detached: boolean) => void;
};

export function createWorkspaceCommandHandlers(s: WorkspaceState, runtime: Runtime, deps: CommandActionDeps) {
  const { app } = s;
  const { pendingPreviewServerRef, pendingTerminalRef, promptForDesktopConnection } = deps;

  async function handleTerminalFollowUp(prompt: string, target: ReturnType<Runtime["activeProjectTarget"]>, reply: ReplyFn) {
    const pending = pendingTerminalRef.current;
    if (!pending || pending.projectId !== target.projectId) return false;
    if (isTerminalDenial(prompt)) {
      pendingTerminalRef.current = null;
      reply(`Cancelled \`${pending.command}\`.`);
      return true;
    }
    if (!isTerminalApproval(prompt)) return false;
    pendingTerminalRef.current = null;
    await runApprovedTerminalCommand(prompt, pending.command, target, reply);
    return true;
  }

  async function handlePreviewServerFollowUp(prompt: string, target: ReturnType<Runtime["activeProjectTarget"]>) {
    const pending = pendingPreviewServerRef.current;
    if (!pending || pending.projectId !== target.projectId) return false;
    if (isTerminalDenial(prompt)) {
      applyPreviewServerDecision(prompt, target, false);
      return true;
    }
    if (!isTerminalApproval(prompt)) return false;
    applyPreviewServerDecision(prompt, target, true);
    return true;
  }

  function applyPreviewServerDecision(prompt: string | null, target: ReturnType<Runtime["activeProjectTarget"]>, approved: boolean) {
    const pending = pendingPreviewServerRef.current;
    if (!pending || pending.projectId !== target.projectId) return;
    pendingPreviewServerRef.current = null;
    if (prompt?.trim()) app.addLocalUserMessage(prompt, target);
    if (!approved) {
      app.updatePreviewServerMessage(pending.messageId, pending.projectId, {
        status: "cancelled",
        phase: "cancelled",
        detail: "Cancelled by user"
      });
      return;
    }
    app.updatePreviewServerMessage(pending.messageId, pending.projectId, {
      status: "starting",
      phase: "requesting-desktop",
      detail: "Sending request to Vibyra Desktop"
    });
    void runApprovedPreviewServer(target, pending.messageId);
  }

  async function handleTerminalCommand(prompt: string, command: string, target: ReturnType<Runtime["activeProjectTarget"]>, reply: ReplyFn) {
    if (!app.connection) {
      promptForDesktopConnection(prompt, "", false);
      return;
    }
    if (needsTerminalApproval(command)) {
      pendingTerminalRef.current = { command, projectId: target.projectId };
      reply(`Approve running \`${command}\` in **${target.project.name}**? Reply yes to run it or no to cancel.`);
      return;
    }
    await runApprovedTerminalCommand(prompt, command, target, reply);
  }

  function rememberPreviewServerApproval(target: ReturnType<Runtime["activeProjectTarget"]>, messageId: string) {
    pendingPreviewServerRef.current = { projectId: target.projectId, messageId };
  }

  async function runApprovedTerminalCommand(prompt: string, command: string, target: ReturnType<Runtime["activeProjectTarget"]>, reply: ReplyFn) {
    try {
      const result = await app.runTerminalCommand(command, target);
      reply(commandOutputReply(result.command, result.ok, result.output), target.project);
    } catch (error) {
      reply(error instanceof Error ? error.message : `Could not run \`${command}\`.`, target.project);
    }
  }

  async function runApprovedPreviewServer(target: ReturnType<Runtime["activeProjectTarget"]>, messageId: string) {
    try {
      const preview = await app.startPreviewServer(target.projectId, target.project.name, (phase, detail) => {
        app.updatePreviewServerMessage(messageId, target.projectId, {
          status: phase === "ready" ? "ready" : "starting",
          phase,
          detail
        });
      });
      app.updatePreviewServerMessage(messageId, target.projectId, {
        status: "ready",
        phase: "ready",
        detail: "Phone preview route verified"
      }, preview);
    } catch (error) {
      app.updatePreviewServerMessage(messageId, target.projectId, {
        status: "failed",
        phase: "failed",
        detail: error instanceof Error ? error.message : "Could not start the preview server."
      });
    }
  }

  return {
    applyPreviewServerDecision,
    handlePreviewServerFollowUp,
    handleTerminalCommand,
    handleTerminalFollowUp,
    rememberPreviewServerApproval
  };
}
