import type { ChatMessage, DesktopConnectionPrompt, GeneratedApp } from "../../../types/domain";
import { previewAppFromMessage } from "../inline/chatPreviewFallback";

export function latestDisplayableApp(...groups: Array<GeneratedApp | null | undefined | Array<Pick<ChatMessage, "app" | "id" | "text">>>) {
  for (const group of groups) {
    if (!group) continue;
    if (!Array.isArray(group)) {
      if (isDisplayableApp(group)) return group;
      continue;
    }
    for (let i = group.length - 1; i >= 0; i -= 1) {
      const message = group[i];
      const app = message?.app ?? (message ? previewAppFromMessage(message.id, message.text) : null);
      if (isDisplayableApp(app)) return app;
    }
  }
  return null;
}

function isDisplayableApp(app: GeneratedApp | null | undefined): app is GeneratedApp {
  return Boolean(app?.html?.trim() || app?.url?.trim());
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
