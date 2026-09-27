import type { ImportedMemoryNote } from "../ipc/memory";

export function mergeImportedMemory(current: string, notes: ImportedMemoryNote[]): string {
  const imported = notes
    .map((note) => {
      const name = note.name.replace(/[\r\n]+/g, " ").trim() || "Imported note";
      const content = note.content.trim();
      return content ? `## Imported · ${name}\n\n${content}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
  if (!imported) return current;
  return [current.trimEnd(), imported].filter(Boolean).join("\n\n");
}
