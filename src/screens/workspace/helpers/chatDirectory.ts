import type { useWorkspace } from "../hooks/useWorkspace";

export function directoryForChat(selectedChatId: string | null, app: ReturnType<typeof useWorkspace>["app"]) {
  if (!selectedChatId?.startsWith("project-")) return undefined;
  const projectId = selectedChatId.replace("project-", "");
  const project = app.projects.find((item) => item.id === projectId)
    ?? app.chatProjects[projectId]
    ?? (app.selectedProject.id === projectId ? app.selectedProject : undefined);
  return project?.name || folderName(project?.path);
}

function folderName(path?: string) {
  const value = path?.replace(/\\/g, "/").split("/").filter(Boolean).pop();
  return value && value !== "~" ? value : undefined;
}
