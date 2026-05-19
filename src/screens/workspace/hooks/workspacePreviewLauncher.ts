import { previewNotConnectedReply } from "../helpers/chatReplies";
import type { WorkspaceState } from "./useWorkspaceState";
import type { useWorkspaceChatRuntime } from "./workspaceChatRuntime";

type Runtime = ReturnType<typeof useWorkspaceChatRuntime>;

export function useWorkspacePreviewLauncher(s: WorkspaceState, runtime: Runtime) {
  const { app } = s;

  async function openPreview(userText = "/preview") {
    if (await runtime.openRunnablePreview()) return true;
    const target = runtime.activeProjectTarget();
    if (!app.connection) {
      app.addLocalChatReply(userText, previewNotConnectedReply(target.project.name), target);
      return false;
    }

    const messageId = app.addLocalPreviewServerPrompt(userText, target);
    app.updatePreviewServerMessage(messageId, target.projectId, {
      status: "starting",
      phase: "requesting-desktop",
      detail: "Sending request to Vibyra Desktop"
    });

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
      s.setPreviewApp(preview);
      return true;
    } catch (error) {
      app.updatePreviewServerMessage(messageId, target.projectId, {
        status: "failed",
        phase: "failed",
        detail: error instanceof Error ? error.message : "Could not start the preview server."
      });
      return false;
    }
  }

  return { openPreview };
}
