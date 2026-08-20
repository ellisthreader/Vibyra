import { useEffect, useMemo, useState } from "react";

import { fsListDir } from "../../ipc/fs";
import { visibleFileEntries } from "../../lib/fileTreePolicy";
import { basename } from "../../state/projectStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import type { DirEntryInfo } from "../../types";
import { ChevronIcon, FileIcon, FolderIcon } from "../common/Icons";
import { FileTreeToolbar } from "./FileTreeToolbar";

function TreeNode({
  entry,
  depth,
  query,
  selectedPath,
  showGenerated,
  showHidden,
}: {
  entry: DirEntryInfo;
  depth: number;
  query: string;
  selectedPath: string | null;
  showGenerated: boolean;
  showHidden: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DirEntryInfo[]>([]);
  const fsVersion = useWorkspaceStore((s) => s.fsVersion);
  const openPreview = useWorkspaceStore((s) => s.openPreview);

  useEffect(() => {
    if (!entry.isDir || !expanded) return;
    let cancelled = false;
    fsListDir(entry.path, showHidden)
      .then((entries) => {
        if (!cancelled) setChildren(entries);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [entry.isDir, entry.path, expanded, showHidden, fsVersion]);

  const indent = { paddingLeft: `${depth * 13 + 6}px` };
  const visibleChildren = useMemo(
    () => visibleFileEntries(children, { query, showGenerated }),
    [children, query, showGenerated],
  );

  if (!entry.isDir) {
    const selected = entry.path === selectedPath;
    return (
      <button
        className={`tree-row tree-row--file ${selected ? "tree-row--selected" : ""}`}
        style={indent}
        title={entry.name}
        aria-current={selected ? "true" : undefined}
        onClick={() => void openPreview(entry.path)}
      >
        <span className="tree-row__chevron" />
        <span className="tree-row__icon"><FileIcon size={12} /></span>
        <span className="tree-row__name">{entry.name}</span>
      </button>
    );
  }

  return (
    <>
      <button
        className="tree-row tree-row--folder"
        style={indent}
        title={entry.name}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`tree-row__chevron ${expanded ? "tree-row__chevron--open" : ""}`}>
          <ChevronIcon size={10} />
        </span>
        <span className="tree-row__icon"><FolderIcon size={12} /></span>
        <span className="tree-row__name">{entry.name}</span>
      </button>
      {expanded &&
        visibleChildren.map((child) => (
          <TreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            query={query}
            selectedPath={selectedPath}
            showGenerated={showGenerated}
            showHidden={showHidden}
          />
        ))}
    </>
  );
}

export function FileTree() {
  const root = useWorkspaceStore((s) => s.root);
  const fsVersion = useWorkspaceStore((s) => s.fsVersion);
  const selectedPath = useWorkspaceStore((s) => s.preview?.path ?? null);
  const [entries, setEntries] = useState<DirEntryInfo[]>([]);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showGenerated, setShowGenerated] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    if (!root) return;
    let cancelled = false;
    fsListDir(root, showHidden)
      .then((list) => {
        if (!cancelled) setEntries(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [root, showHidden, fsVersion]);

  const visibleEntries = useMemo(
    () => visibleFileEntries(entries, { query, showGenerated }),
    [entries, query, showGenerated],
  );

  return (
    <div className="rail__section rail__files file-tree" aria-label="Project files">
      <FileTreeToolbar
        rootName={root ? basename(root) : "Project"}
        query={query}
        searchOpen={searchOpen}
        showGenerated={showGenerated}
        showHidden={showHidden}
        onQuery={setQuery}
        onSearchOpen={setSearchOpen}
        onShowGenerated={() => setShowGenerated((value) => !value)}
        onShowHidden={() => setShowHidden((value) => !value)}
      />
      <div className="tree">
        {visibleEntries.map((entry) => (
          <TreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            query={query}
            selectedPath={selectedPath}
            showGenerated={showGenerated}
            showHidden={showHidden}
          />
        ))}
        {visibleEntries.length === 0 && (
          <p className="tree-empty">{query ? "No matching files here." : "This folder is empty."}</p>
        )}
      </div>
    </div>
  );
}
