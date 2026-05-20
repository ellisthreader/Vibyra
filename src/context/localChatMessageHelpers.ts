import type { DesktopConnectionPrompt, ChatMessage } from "../types/domain";
import type { AppContextValue } from "./appContextTypes";

export function previewServerText(projectName: string, status: NonNullable<AppContextValue["chatMessages"][number]["previewServer"]>["status"]) {
  if (status === "ready") return `Preview is ready for ${projectName}`;
  if (status === "failed") return `Preview failed for ${projectName}`;
  if (status === "cancelled") return `Preview start cancelled for ${projectName}`;
  if (status === "starting") return `Starting preview server for ${projectName}`;
  return `Start preview server for ${projectName}`;
}

export function updateThreadMessage(
  current: Record<string, ChatMessage[]>,
  projectId: string,
  messageId: string,
  update: (message: ChatMessage) => ChatMessage
) {
  const thread = current[projectId];
  if (!thread) return current;
  return { ...current, [projectId]: thread.map((message) => (message.id === messageId ? update(message) : message)) };
}

export function desktopConnectionReply(connectionPrompt: DesktopConnectionPrompt) {
  if (connectionPrompt.reason === "desktop-agent") {
    return "Connect Vibyra Desktop so I can create a project folder on your PC.";
  }
  if (connectionPrompt.reason === "desktop-browse") {
    return connectionPrompt.query
      ? `Connect Vibyra Desktop so I can open "${connectionPrompt.query}" from your PC.`
      : "Connect Vibyra Desktop so I can open this PC project.";
  }
  return connectionPrompt.query
    ? `Connect Vibyra Desktop so I can search your PC for "${connectionPrompt.query}".`
    : "Connect Vibyra Desktop so I can search and open folders on your PC.";
}
