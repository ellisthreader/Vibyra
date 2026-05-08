import { CodeChange, FileEntry, Project } from "../types/domain";

export function mergeProjects(existing: Project[], incoming: Project[]): Project[] {
  const incomingIds = new Set(incoming.map((project) => project.id));
  const adopted = existing.filter((project) => !incomingIds.has(project.id));
  return [...incoming, ...adopted];
}

export function dedupeFiles(files: FileEntry[]) {
  const byId = new Map<string, FileEntry>();
  for (const file of files) {
    byId.set(file.id, file);
  }
  return Array.from(byId.values());
}

export function formatAssistantReply(reply: string, changes: CodeChange[]) {
  const applied = changes
    .filter((change) => change.summary.includes("Applied Vibyra generated file"))
    .map((change) => change.file);

  if (applied.length === 0) {
    return reply.trim() || "Done.";
  }

  const label = applied.length === 1 ? "file" : "files";
  return `${reply.trim() || "Done."}\n\nApplied ${applied.length} ${label}:\n${applied.map((file) => `- ${file}`).join("\n")}`;
}
