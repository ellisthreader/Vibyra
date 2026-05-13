import type { DesktopBrowseEntry, FileEntry, Project } from "../../../types/domain";

export function currentProjectReply(project: Project, selectedFileName: string) {
  const cleanName = project.name.trim() || "this project";
  const cleanPath = project.path.trim();
  const file = selectedFileName && selectedFileName !== "No files" ? ` The selected file is ${selectedFileName}.` : "";
  return `You are currently in ${cleanName}${cleanPath ? ` at ${cleanPath}` : ""}.${file}`;
}

export function projectFilesReply(project: Project, files: FileEntry[]) {
  const visibleFiles = files.filter((file) => file.id !== "empty");
  if (visibleFiles.length === 0) {
    return `I don't see any readable files loaded in ${project.name}. Try reopening the folder or choose another folder from Browse PC.`;
  }
  const names = visibleFiles.slice(0, 40).map((file) => `• ${file.path}`).join("\n");
  const more = visibleFiles.length > 40 ? `\n…and ${visibleFiles.length - 40} more.` : "";
  return `Files I can see in ${project.name}:\n${names}${more}`;
}

export function folderContentsReply(project: Project, entries: DesktopBrowseEntry[]) {
  if (entries.length === 0) return `${project.name} is open, and that folder is currently empty.`;
  const names = entries.slice(0, 40).map((entry) => `• ${entry.kind === "folder" ? "[folder] " : ""}${entry.name}`).join("\n");
  const more = entries.length > 40 ? `\n…and ${entries.length - 40} more.` : "";
  return `Inside ${project.name}:\n${names}${more}`;
}

export function desktopConnectionRequiredReply(searchQuery: string) {
  const target = searchQuery ? ` for "${searchQuery}"` : "";
  return `I can search your desktop${target}, but only when Vibyra Desktop is connected. Open Vibyra Desktop on your PC, pair this app, then send this again.`;
}
