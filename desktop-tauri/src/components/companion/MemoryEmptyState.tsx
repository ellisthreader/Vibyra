import type { MemoryVaultSummary } from "../../ipc/memory";
import { ChevronIcon, FileIcon, LinkIcon, MemoryIcon } from "../common/Icons";

interface MemoryEmptyStateProps {
  suggestions: MemoryVaultSummary[];
  busy: boolean;
  error: string | null;
  onConnect: (candidateId?: string) => void;
  onImport: () => void;
}

function noteCount(vault: MemoryVaultSummary): string {
  return `${vault.noteCount}${vault.countLimited ? "+" : ""} note${vault.noteCount === 1 ? "" : "s"}`;
}

export function MemoryEmptyState(props: MemoryEmptyStateProps) {
  return (
    <div className="memory-empty">
      <span className="memory-empty__mark"><MemoryIcon size={18} /></span>
      <h3>Bring your memory with you</h3>
      <p>Link a read-only Obsidian vault, or copy existing notes into this project.</p>

      {props.suggestions.length > 0 && (
        <div className="memory-suggestions">
          <span className="memory-suggestions__label">Found in Obsidian</span>
          {props.suggestions.slice(0, 3).map((vault) => (
            <button key={vault.id} disabled={props.busy} onClick={() => props.onConnect(vault.id)}>
              <LinkIcon size={14} />
              <span><strong>{vault.name}</strong><small>{vault.location} · {noteCount(vault)}</small></span>
              <ChevronIcon size={11} />
            </button>
          ))}
        </div>
      )}

      <div className="memory-empty__choices" aria-label="Add existing memory">
        <button disabled={props.busy} onClick={() => props.onConnect()}>
          <LinkIcon size={14} />
          <span><strong>Obsidian vault</strong><small>Relevant notes can support Chat</small></span>
        </button>
        <button disabled={props.busy} onClick={props.onImport}>
          <FileIcon size={14} />
          <span><strong>Markdown files</strong><small>Import .md, .markdown, or .txt</small></span>
        </button>
      </div>
      {props.error && <p className="memory-empty__error" role="alert">{props.error}</p>}
    </div>
  );
}
