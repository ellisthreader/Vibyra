const terminalMemoryImportLimits = {
  maxFiles: 500,
  maxFileBytes: 500 * 1024,
  maxTotalBytes: 10 * 1024 * 1024
};

async function importTerminalMemoryFiles(fileList, kind = "markdown") {
  const files = Array.from(fileList || []).filter((file) => file && typeof file.text === "function");
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
    terminalMemoryState.view = "graph";
    await loadTerminalMemoryVault(terminalMemoryState.projectId, true);
    terminalMemoryState.status = result.notice ? String(result.notice) : summary;
    terminalMemoryUpdateStatus();
  } catch (error) {
    terminalMemoryState.status = terminalMemoryError(error, "Markdown import failed.");
    terminalMemoryUpdateStatus();
  }
}

async function pickTerminalMemoryFiles(kind = "markdown") {
  if (!window.vibyraDesktopMemory?.pick || terminalMemoryState.loading) return;
  terminalMemoryState.status = "Opening file picker...";
  terminalMemoryUpdateStatus();
  try {
    const result = await window.vibyraDesktopMemory.pick(kind);
    if (result?.canceled) {
      terminalMemoryState.status = "";
      terminalMemoryUpdateStatus();
      return;
    }
    await importTerminalMemoryManifest(result?.files, kind);
  } catch (error) {
    terminalMemoryState.status = terminalMemoryError(error, "Markdown import failed.");
    terminalMemoryUpdateStatus();
  }
}

async function importTerminalMemoryDiscoveredVault(id) {
  if (!window.vibyraDesktopMemory?.importDiscoveredVault || terminalMemoryState.loading) return;
  terminalMemoryState.status = "Reading Obsidian vault...";
  terminalMemoryUpdateStatus();
  try {
    const result = await window.vibyraDesktopMemory.importDiscoveredVault(id);
    await importTerminalMemoryManifest(result?.files, "vault");
  } catch (error) {
    terminalMemoryState.status = terminalMemoryError(error, "Obsidian vault import failed.");
    terminalMemoryUpdateStatus();
  }
}

async function importTerminalMemoryManifest(files, kind = "markdown") {
  const manifestFiles = Array.isArray(files) ? files : [];
  if (!terminalMemoryState.projectId || !manifestFiles.length) {
    throw new Error("No supported Markdown files were selected.");
  }
  terminalMemoryState.status = `Importing ${manifestFiles.length} notes...`;
  terminalMemoryUpdateStatus();
  const result = await terminalMemoryRequest("/desktop/project-memory/import", {
    method: "POST",
    body: JSON.stringify({
      projectId: terminalMemoryState.projectId,
      collisionStrategy: "keep_both",
      files: manifestFiles
    })
  });
  terminalMemoryState.view = "graph";
  await loadTerminalMemoryVault(terminalMemoryState.projectId, true);
  terminalMemoryState.status = result.notice || `Imported ${manifestFiles.length} notes`;
  terminalMemoryUpdateStatus();
}

function terminalMemoryImportMenuHtml(className = "terminal-memory-toolbar-import-menu") {
  return `<details class="${className}">
    <summary title="Import memory">${icon("share")}<span>Import</span>${icon("chevron-down")}</summary>
    <div class="terminal-memory-import-menu-popover" role="menu">
      <label data-terminal-memory-pick="vault" role="menuitem">
        ${icon("folder")}<span><strong>Obsidian vault</strong><small>Import a folder of linked notes</small></span>
        <input type="file" accept=".md,text/markdown" multiple webkitdirectory directory data-terminal-memory-vault-input>
      </label>
      <label data-terminal-memory-pick="markdown" role="menuitem">
        ${icon("document")}<span><strong>Markdown files</strong><small>Choose individual notes</small></span>
        <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple data-terminal-memory-markdown-input>
      </label>
    </div>
  </details>`;
}

async function buildTerminalMemoryManifest(files, kind) {
  if (files.length > terminalMemoryImportLimits.maxFiles) {
    throw new Error(`Choose no more than ${terminalMemoryImportLimits.maxFiles} Markdown files.`);
  }
  const accepted = [];
  const skipped = [];
  let totalBytes = 0;
  for (const file of files) {
    const sourcePath = normalizeTerminalMemoryImportPath(file.webkitRelativePath || file.name);
    const reason = terminalMemoryImportRejection(file, sourcePath, kind);
    if (reason) {
      skipped.push({ path: sourcePath || file.name, reason });
      continue;
    }
    const path = kind === "markdown" && /\.(txt|markdown)$/i.test(sourcePath)
      ? sourcePath.replace(/\.(txt|markdown)$/i, ".md")
      : sourcePath;
    totalBytes += file.size;
    if (totalBytes > terminalMemoryImportLimits.maxTotalBytes) {
      throw new Error("The selected Markdown files exceed the 10 MB import limit.");
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
  if (kind === "vault" && !/\.md$/i.test(path)) return "Not Markdown";
  if (kind !== "vault" && !/\.(md|markdown|txt)$/i.test(path)) return "Not a Markdown or text note";
  if (file.size > terminalMemoryImportLimits.maxFileBytes) return "File exceeds 500 KB";
  const parts = path.split("/");
  const ignored = new Set([".obsidian", ".git", "node_modules", ".expo", ".vibyra-agent", "vendor"]);
  if (parts.some((part) => ignored.has(part) || (part.startsWith(".") && part !== "."))) return "Ignored folder";
  if (kind !== "vault" && parts.length > 1) return "Unexpected directory path";
  return "";
}

function consumeTerminalMemoryImport(event, kind) {
  const files = Array.from(event?.target?.files || []);
  if (event?.target) event.target.value = "";
  void importTerminalMemoryFiles(files, kind);
}
