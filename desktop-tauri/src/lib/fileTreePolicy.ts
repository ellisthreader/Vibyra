import type { DirEntryInfo } from "../types";

const GENERATED_DIRECTORIES = new Set([
  ".cache",
  ".expo",
  ".git",
  ".next",
  ".turbo",
  ".vite",
  ".vibyra-agent",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "pods",
  "target",
  "temp",
  "tmp",
  "vendor",
]);

export interface FileTreeFilter {
  query: string;
  showGenerated: boolean;
}

function isGeneratedDirectory(entry: DirEntryInfo): boolean {
  return entry.isDir && GENERATED_DIRECTORIES.has(entry.name.toLowerCase());
}

export function visibleFileEntries(
  entries: DirEntryInfo[],
  { query, showGenerated }: FileTreeFilter,
): DirEntryInfo[] {
  const needle = query.trim().toLocaleLowerCase();
  return entries.filter((entry) => {
    if (!showGenerated && isGeneratedDirectory(entry)) return false;
    if (!needle || entry.isDir) return true;
    return entry.name.toLocaleLowerCase().includes(needle);
  });
}
