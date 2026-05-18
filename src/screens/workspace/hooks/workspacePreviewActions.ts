import type { AppContextValue } from "../../../context/appContextTypes";
import type { GeneratedApp, Project } from "../../../types/domain";
import { isPreviewTroubleIntent, isViewPreviewIntent, previewNeedsProjectReply, previewNotConnectedReply, previewOpeningReply, previewTroubleReply } from "../helpers/chatReplies";
import type { useWorkspaceChatRuntime } from "./workspaceChatRuntime";

type Runtime = ReturnType<typeof useWorkspaceChatRuntime>;
type PreviewReply = (reply: string, project?: Project, preview?: GeneratedApp) => void;
type PreviewStartApproval = (target: ReturnType<Runtime["activeProjectTarget"]>, messageId: string) => void;

export async function handleWorkspacePreviewIntent({
  app,
  detached,
  prompt,
  reply,
  runtime,
  onNeedsServerApproval
}: {
  app: AppContextValue;
  detached: boolean;
  prompt: string;
  reply: PreviewReply;
  runtime: Runtime;
  onNeedsServerApproval?: PreviewStartApproval;
}) {
  const wantsPreview = isViewPreviewIntent(prompt) || isPreviewTroubleIntent(prompt);
  if (!wantsPreview) return false;
  if (detached) {
    runtime.addDetachedChatReply(prompt, previewNeedsProjectReply());
    return true;
  }

  const target = runtime.activeProjectTarget();
  const preview = await runtime.runnablePreviewApp();
  if (preview) {
    reply(isPreviewTroubleIntent(prompt) ? previewTroubleReply(target.project.name) : previewOpeningReply(target.project.name), target.project, preview);
    app.setTaskText("");
    return true;
  }
  if (!app.connection) {
    reply(previewNotConnectedReply(target.project.name), target.project);
    return true;
  }
  const messageId = app.addLocalPreviewServerPrompt(prompt, target);
  onNeedsServerApproval?.(target, messageId);
  return true;
}
