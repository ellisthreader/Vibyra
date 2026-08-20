import { useDeferredValue, useMemo, useState } from "react";

import type { MemoryVaultSummary } from "../../ipc/memory";
import type { MemoryHeading } from "../../lib/memoryDocument";
import {
  buildMemoryTree,
  memoryNoteTitle,
  searchMemoryPaths,
  type MemoryTreeNode,
} from "../../lib/memoryTree";
import { ChevronIcon, FileIcon, FolderIcon, MemoryIcon, SearchIcon } from "../common/Icons";

interface TreeRowsProps {
  nodes: MemoryTreeNode[];
  depth: number;
  expanded: Set<string>;
  selectedPath: string | null;
  onFolder: (id: string) => void;
  onNote: (path: string) => void;
}

function TreeRows(props: TreeRowsProps) {
  return props.nodes.map((node) => {
    const open = node.kind === "folder" && props.expanded.has(node.id);
    return (
      <div key={node.id}>
        <button
          className={`memory-nav__row ${open ? "is-open" : ""} ${node.path === props.selectedPath ? "is-active" : ""}`}
          style={{ paddingLeft: `${8 + props.depth * 12}px` }}
          title={node.path ?? node.name}
          onClick={() => node.kind === "folder" ? props.onFolder(node.id) : props.onNote(node.path!)}
        >
          {node.kind === "folder" ? (
            <><ChevronIcon size={10} /><FolderIcon size={12} /><span>{node.name}</span></>
          ) : (
            <><span className="memory-nav__spacer" /><FileIcon size={11} /><span>{node.name}</span></>
          )}
        </button>
        {open && (
          <TreeRows {...props} nodes={node.children} depth={props.depth + 1} />
        )}
      </div>
    );
  });
}

export function MemoryNavigator({
  vault,
  paths,
  limited,
  loading,
  selectedPath,
  headings,
  onSelectPath,
  onHeading,
}: {
  vault: MemoryVaultSummary | null;
  paths: string[];
  limited: boolean;
  loading: boolean;
  selectedPath: string | null;
  headings: MemoryHeading[];
  onSelectPath: (path: string | null) => void;
  onHeading: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const deferredQuery = useDeferredValue(query);
  const tree = useMemo(() => buildMemoryTree(paths), [paths]);
  const matches = useMemo(
    () => searchMemoryPaths(paths, deferredQuery),
    [paths, deferredQuery],
  );
  const toggleFolder = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <aside className="memory-nav" aria-label="Memory notes">
      <button
        className={`memory-nav__project ${selectedPath === null ? "is-active" : ""}`}
        onClick={() => onSelectPath(null)}
      >
        <MemoryIcon size={12} /><span>Project memory</span>
      </button>
      {selectedPath === null && headings.length > 0 && (
        <div className="memory-nav__outline" aria-label="Document outline">
          {headings.slice(0, 24).map((heading) => (
            <button
              key={heading.id}
              style={{ paddingLeft: `${11 + Math.min(heading.level - 1, 3) * 8}px` }}
              onClick={() => onHeading(heading.id)}
            >
              {heading.text}
            </button>
          ))}
        </div>
      )}
      {vault && (
        <>
          <label className="memory-nav__search">
            <SearchIcon size={11} />
            <input
              value={query}
              aria-label={`Search ${vault.name}`}
              placeholder="Find notes"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="memory-nav__tree">
            {loading ? (
              <span className="memory-nav__quiet">Indexing notes…</span>
            ) : deferredQuery.trim() ? (
              matches.map((path) => (
                <button
                  className={`memory-nav__result ${path === selectedPath ? "is-active" : ""}`}
                  key={path}
                  title={path}
                  onClick={() => onSelectPath(path)}
                >
                  <FileIcon size={11} /><span>{memoryNoteTitle(path)}</span><small>{path}</small>
                </button>
              ))
            ) : (
              <TreeRows
                nodes={tree}
                depth={0}
                expanded={expanded}
                selectedPath={selectedPath}
                onFolder={toggleFolder}
                onNote={(path) => onSelectPath(path)}
              />
            )}
          </div>
          <span className="memory-nav__count">
            {paths.length}{limited ? "+" : ""} note{paths.length === 1 ? "" : "s"}
          </span>
        </>
      )}
    </aside>
  );
}
