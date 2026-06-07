const terminalMemoryImportLimits = {
  maxFiles: 500,
  maxFileBytes: 500 * 1024,
  maxTotalBytes: 10 * 1024 * 1024
};

async function importTerminalMemoryFiles(fileList, kind = "markdown") {
  const files = Array.from(fileList || []);
  if (!terminalMemoryState.projectId || !files.length) return;
  terminalMemoryState.status = "Reading Markdown...";
  terminalMemoryUpdateStatus();
  try {
    const manifest = await buildTerminalMemoryManifest(files, kind);
    if (!manifest.files.length) throw new Error("No supported Markdown files were selected.");
    terminalMemoryState.status = `Importing ${manifest.files.length} notes...`;
    terminalMemoryUpdateStatus();
    const result = await terminalMemoryRequest("/desktop/project-memory/import", {
      method: "POST",
      body: JSON.stringify({
        projectId: terminalMemoryState.projectId,
        collisionStrategy: "keep_both",
        files: manifest.files
      })
    });
    const summary = manifest.skipped.length
      ? `Imported ${manifest.files.length}; skipped ${manifest.skipped.length}`
      : `Imported ${manifest.files.length} notes`;
    await loadTerminalMemoryVault(terminalMemoryState.projectId, true);
    terminalMemoryState.status = result.notice ? String(result.notice) : summary;
    terminalMemoryUpdateStatus();
  } catch (error) {
    terminalMemoryState.status = terminalMemoryError(error, "Markdown import failed.");
    terminalMemoryUpdateStatus();
  }
}

async function buildTerminalMemoryManifest(files, kind) {
  if (files.length > terminalMemoryImportLimits.maxFiles) {
    throw new Error(`Choose no more than ${terminalMemoryImportLimits.maxFiles} Markdown files.`);
  }
  const accepted = [];
  const skipped = [];
  let totalBytes = 0;
  for (const file of files) {
    const path = normalizeTerminalMemoryImportPath(file.webkitRelativePath || file.name);
    const reason = terminalMemoryImportRejection(file, path, kind);
    if (reason) {
      skipped.push({ path: path || file.name, reason });
      continue;
    }
    totalBytes += file.size;
    if (totalBytes > terminalMemoryImportLimits.maxTotalBytes) {
      throw new Error("The selected Markdown files exceed the 20 MB import limit.");
    }
    accepted.push({
      path,
      markdown: await file.text(),
      source: kind === "vault" ? "obsidian_import" : "markdown_import"
    });
  }
  return { files: accepted, skipped };
}

function normalizeTerminalMemoryImportPath(value) {
  const parts = String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== ".");
  if (!parts.length || parts.some((part) => part === ".." || part.includes("\0"))) return "";
  return parts.join("/");
}

function terminalMemoryImportRejection(file, path, kind) {
  if (!path) return "Invalid path";
  if (!/\.md$/i.test(path)) return "Not Markdown";
  if (file.size > terminalMemoryImportLimits.maxFileBytes) return "File exceeds 500 KB";
  const parts = path.split("/");
  const ignored = new Set([".obsidian", ".git", "node_modules", ".expo", ".vibyra-agent", "vendor"]);
  if (parts.some((part) => ignored.has(part) || (part.startsWith(".") && part !== "."))) return "Ignored folder";
  if (kind !== "vault" && parts.length > 1) return "Unexpected directory path";
  return "";
}

function openTerminalMemoryImport(kind) {
  const selector = kind === "vault" ? "[data-terminal-memory-vault-input]" : "[data-terminal-memory-file-input]";
  const input = document.querySelector(selector);
  if (!input) return;
  input.value = "";
  input.click();
}
