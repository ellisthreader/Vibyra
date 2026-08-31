import type { MemorySnippet } from "../ipc/memory";

/** Caps what the vault may contribute to one turn's context. */
const VAULT_CONTEXT_CHARS = 9_000;

function trimTo(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).trimEnd()}\n\n[Context trimmed by Vibyra]`;
}

/**
 * The vault's contribution to a prompt, or "" when it has nothing to lend.
 *
 * Snippets are ranked natively (`memory/search.rs`) and carry their note path,
 * so the model can say which note a claim came from. Labelled read-only
 * because they are: nothing Vibyra does writes back to the vault.
 *
 * An empty-bodied snippet contributes only a path, which is noise rather than
 * context, so it is dropped rather than announced.
 */
export function formatVaultContext(snippets: MemorySnippet[]): string {
  const notes = snippets
    .map((snippet) => ({ path: snippet.path, content: snippet.content.trim() }))
    .filter((snippet) => snippet.content.length > 0)
    .map((snippet) => `Note: ${snippet.path}\n${snippet.content}`)
    .join("\n\n");
  if (!notes) return "";
  return `Relevant read-only notes selected locally from the connected Obsidian vault:\n${trimTo(notes, VAULT_CONTEXT_CHARS)}`;
}
