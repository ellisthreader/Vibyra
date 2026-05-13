import type { useWorkspace } from "../hooks/useWorkspace";

export function directoryForChat(selectedChatId: string | null, app: ReturnType<typeof useWorkspace>["app"]) {
  if (!selectedChatId?.startsWith("project-")) return undefined;
  const projectId = selectedChatId.replace("project-", "");
  return app.projects.find((item) => item.id === projectId)?.path
    ?? app.chatProjects[projectId]?.path
    ?? directoryName(app.selectedFile.path);
}

function directoryName(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length <= 1 ? (normalized || "No directory") : parts.slice(0, -1).join("/");
}
