export interface MemoryTreeNode {
  id: string;
  name: string;
  kind: "folder" | "note";
  path?: string;
  children: MemoryTreeNode[];
}

interface MutableFolder extends MemoryTreeNode {
  folders: Map<string, MutableFolder>;
}

function title(pathPart: string): string {
  return pathPart.replace(/\.(?:md|markdown|txt)$/i, "");
}

function sorted(nodes: MemoryTreeNode[]): MemoryTreeNode[] {
  return nodes.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
}

export function buildMemoryTree(paths: string[]): MemoryTreeNode[] {
  const root: MutableFolder = {
    id: "root",
    name: "root",
    kind: "folder",
    children: [],
    folders: new Map(),
  };
  for (const path of paths) {
    const parts = path.split("/").filter(Boolean);
    if (!parts.length) continue;
    let parent = root;
    for (const part of parts.slice(0, -1)) {
      let folder = parent.folders.get(part);
      if (!folder) {
        folder = {
          id: `${parent.id}/${part}`,
          name: part,
          kind: "folder",
          children: [],
          folders: new Map(),
        };
        parent.folders.set(part, folder);
        parent.children.push(folder);
      }
      parent = folder;
    }
    parent.children.push({
      id: path,
      name: title(parts.at(-1) ?? path),
      kind: "note",
      path,
      children: [],
    });
  }
  const finish = (nodes: MemoryTreeNode[]): MemoryTreeNode[] =>
    sorted(nodes).map((node) => ({ ...node, children: finish(node.children) }));
  return finish(root.children);
}

export function searchMemoryPaths(paths: string[], query: string, limit = 80): string[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return paths
    .filter((path) => path.toLocaleLowerCase().includes(normalized))
    .slice(0, limit);
}

export function memoryNoteTitle(path: string): string {
  return title(path.split("/").at(-1) ?? path);
}

export function resolveMemoryLink(paths: string[], target: string): string | null {
  const raw = target.split("|")[0].split("#")[0].trim().replace(/\\/g, "/");
  if (!raw) return null;
  const needle = raw.replace(/\.(?:md|markdown|txt)$/i, "").toLocaleLowerCase();
  const normalized = paths.map((path) => ({
    path,
    key: path.replace(/\.(?:md|markdown|txt)$/i, "").toLocaleLowerCase(),
  }));
  return normalized.find(({ key }) => key === needle)?.path
    ?? normalized.find(({ key }) => key.endsWith(`/${needle}`))?.path
    ?? null;
}
