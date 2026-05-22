import type { ChatToolMode } from "../../../types/chatTools";

export type DetachedAttachmentDecision =
  | { kind: "tool"; tool: ChatToolMode }
  | { kind: "reply"; message: string }
  | { kind: "continue" };

export function detachedAttachmentDecision(
  tool: ChatToolMode | undefined,
  fileAttachmentCount: number,
  imageAttachmentCount: number
): DetachedAttachmentDecision {
  if (tool) return { kind: "tool", tool };
  if (fileAttachmentCount > 0) return { kind: "tool", tool: "analyze" };
  if (imageAttachmentCount > 0) {
    return { kind: "reply", message: "Open a project chat first so I can use images with the AI chat." };
  }
  return { kind: "continue" };
}
