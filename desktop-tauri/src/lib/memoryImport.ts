import type { ImportedMemoryNote, MemorySnippet } from "../ipc/memory";

const LOCAL_CONTEXT_CHARS = 24_000;
const SOURCE_CONTEXT_CHARS = 9_000;

function trimTo(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).trimEnd()}\n\n[Context trimmed by Vibyra]`;
}

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

export function formatMemoryContext(local: string, snippets: MemorySnippet[]): string {
  const sections: string[] = [];
  const localMemory = local.trim();
  if (localMemory) {
    sections.push(`The user's editable MEMORY.md for this project:\n${trimTo(localMemory, LOCAL_CONTEXT_CHARS)}`);
  }
  const connected = snippets
    .map((snippet) => `Note: ${snippet.path}\n${snippet.content.trim()}`)
    .filter((snippet) => !snippet.endsWith("\n"))
    .join("\n\n");
  if (connected) {
    sections.push(
      `Relevant read-only notes selected locally from the connected Obsidian vault:\n${trimTo(connected, SOURCE_CONTEXT_CHARS)}`,
    );
  }
  return sections.join("\n\n");
}
