const { readdir, readFile, stat } = require("node:fs/promises");
const path = require("node:path");

const MAX_FILES = 500;
const MAX_FILE_BYTES = 500 * 1024;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const IGNORED_FOLDERS = new Set([".git", ".obsidian", ".expo", ".vibyra-agent", "node_modules", "vendor"]);

async function pickMemoryFiles(dialog, window, kind = "markdown") {
  const vault = kind === "vault";
  const result = await dialog.showOpenDialog(window, {
    title: vault ? "Import Obsidian vault" : "Import Markdown notes",
    buttonLabel: vault ? "Import vault" : "Import notes",
    properties: vault ? ["openDirectory"] : ["openFile", "multiSelections"],
    filters: vault ? undefined : [
      { name: "Markdown and text", extensions: ["md", "markdown", "txt"] },
      { name: "All files", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true, files: [] };
  const files = vault
    ? await readVaultFiles(result.filePaths[0])
    : await readSelectedFiles(result.filePaths);
  return { canceled: false, files };
}

async function readSelectedFiles(filePaths) {
  return readManifest(filePaths.slice(0, MAX_FILES).map((filePath) => ({
    absolutePath: filePath,
    relativePath: path.basename(filePath),
    source: "markdown_import"
  })));
}

async function readVaultFiles(rootPath) {
  const entries = [];
  await walkVault(rootPath, rootPath, entries);
  return readManifest(entries.slice(0, MAX_FILES));
}

async function walkVault(rootPath, currentPath, entries) {
  if (entries.length >= MAX_FILES) return;
  const children = await readdir(currentPath, { withFileTypes: true });
  for (const child of children) {
    if (entries.length >= MAX_FILES) break;
    if (child.name.startsWith(".") || IGNORED_FOLDERS.has(child.name)) continue;
    const absolutePath = path.join(currentPath, child.name);
    if (child.isDirectory()) {
      await walkVault(rootPath, absolutePath, entries);
      continue;
    }
    if (!child.isFile() || !/\.md$/i.test(child.name)) continue;
    entries.push({
      absolutePath,
      relativePath: path.relative(rootPath, absolutePath).split(path.sep).join("/"),
      source: "obsidian_import"
    });
  }
}

async function readManifest(entries) {
  const files = [];
  let totalBytes = 0;
  for (const entry of entries) {
    if (!/\.(md|markdown|txt)$/i.test(entry.relativePath)) continue;
    const info = await stat(entry.absolutePath);
    if (!info.isFile() || info.size > MAX_FILE_BYTES) continue;
    totalBytes += info.size;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Selected notes exceed the 10 MB import limit.");
    const normalizedPath = entry.relativePath.replace(/\.(markdown|txt)$/i, ".md");
    files.push({
      path: normalizedPath,
      markdown: await readFile(entry.absolutePath, "utf8"),
      source: entry.source
    });
  }
  if (!files.length) throw new Error("No supported Markdown files were selected.");
  return files;
}

module.exports = { pickMemoryFiles, readSelectedFiles, readVaultFiles };
