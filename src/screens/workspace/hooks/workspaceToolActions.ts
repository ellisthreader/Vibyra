import type { GeneratedApp, Project } from "../../../types/domain";
import type { ChatFileAttachment, ChatToolMode } from "../../../types/chatTools";
import { chatToolModelOverride, chatToolSkillId, type ChatStartOptions } from "../../../types/chatTools";
import type { WorkspaceState } from "./useWorkspaceState";
import { useWorkspaceChatRuntime } from "./workspaceChatRuntime";
import { createDetachedToolActions } from "./workspaceDetachedToolActions";
import { createImageToolActions } from "./workspaceImageToolActions";

type Runtime = ReturnType<typeof useWorkspaceChatRuntime>;
type ReplyFn = (reply: string, project?: Project, preview?: GeneratedApp) => void;

export function createWorkspaceToolHandlers(s: WorkspaceState, runtime: Runtime) {
  const { app } = s;
  const detachedTools = createDetachedToolActions(app, runtime);
  const imageTools = createImageToolActions(app, runtime);

  async function handleToolMode(
    prompt: string,
    tool: ChatToolMode,
    detached: boolean,
    target: ReturnType<Runtime["activeProjectTarget"]>,
    reply: ReplyFn,
    imageAttachments: ChatStartOptions["imageAttachments"] = [],
    modelOverride?: string,
    fileAttachments: ChatFileAttachment[] = [],
    displayPrompt = prompt
  ) {
    if (tool === "image") {
      await imageTools.createImage(prompt, displayPrompt, detached, target, reply);
      return true;
    }

    const skillId = chatToolSkillId(tool);
    const toolModel = modelOverride || chatToolModelOverride(tool);
    if (!skillId) return false;

    if (detached) {
      await detachedTools.runDetachedCloudTool(
        prompt,
        displayPrompt,
        tool,
        skillId,
        toolModel,
        imageAttachments,
        fileAttachments
      );
      return true;
    }

    await app.startAgent(target, prompt, {
      displayPrompt,
      fileAttachments,
      imageAttachments,
      skillId,
      ...(toolModel ? { model: toolModel } : {})
    });
    return true;
  }

  return { handleToolMode };
}
