const terminalEditorLinkProviders = {};
let terminalEditorGutterTimer = 0;

function openTerminalEditorFile(terminalId, path, line = 1, column = 1) {
  if (!findTerminal(terminalId)) return;
  if (terminalCompanionMode !== "editor") openTerminalCompanionPanel("editor", "terminal-link");
  void loadTerminalEditorWorkspace(terminalId).then(refreshTerminalEditor).catch(() => {});
  void loadTerminalEditorFile(terminalId, path, line, column);
}
function openTerminalEditorWorkspace(terminalId = activeTerminalId, force = false) {
  if (!terminalId || !findTerminal(terminalId)) return;
  const request = loadTerminalEditorWorkspace(terminalId, force);
  refreshTerminalEditor();
  void request
    .catch(() => null)
    .finally(refreshTerminalEditor);
}
function attachTerminalEditorLinkProvider(id, xterm) {
  if (!id || !xterm?.registerLinkProvider || terminalEditorLinkProviders[id]?.xterm === xterm) return;
  terminalEditorLinkProviders[id]?.disposable?.dispose?.();
  const disposable = xterm.registerLinkProvider({
    provideLinks(y, callback) {
      const line = xterm.buffer?.active?.getLine(y - 1)?.translateToString(true) || "";
      callback(terminalEditorLinksForLine(line, y, id));
    }
  });
  terminalEditorLinkProviders[id] = { xterm, disposable };
}
function terminalEditorLinksForLine(line, y, terminalId) {
  const links = [];
  const pattern = /(^|[\s("'`])(@?(?:file:\/\/)?(?:\/|\.{1,2}\/)?(?:[\w@+.,-]+\/)*[\w@+.,-]+\.(?:cpp|cjs|css|env|go|hpp|html|java|json|jsx|kts|mjs|php|svelte|swift|toml|tsx|txt|vue|xml|yaml|yml|cc|js|kt|md|py|rb|rs|sh|sql|ts|c|h))(?::(\d+))?(?::(\d+))?/gi;
  let match = null;
  while ((match = pattern.exec(line))) {
    const prefixLength = match[1]?.length || 0;
    const text = match[2];
    const startIndex = match.index + prefixLength;
    const row = Number(match[3]) || 1;
    const column = Number(match[4]) || 1;
    links.push({
      range: { start: { x: startIndex + 1, y }, end: { x: startIndex + text.length, y } },
      text,
      decorations: { pointerCursor: true, underline: true },
      activate: () => openTerminalEditorFile(terminalId, normalizeTerminalEditorPath(text), row, column)
    });
  }
  return links;
}
function refreshTerminalEditor() {
  if (terminalCompanionMode !== "editor") return;
  syncTerminalCompanion("editor-refresh");
  requestAnimationFrame(() => focusTerminalEditorLocation(activeTerminalEditorTab(), false));
}
function refreshTerminalEditorChrome() {
  const root = document.querySelector("[data-terminal-editor]");
  const tab = activeTerminalEditorTab();
  if (!root || !tab) return;
  const save = root.querySelector("[data-terminal-editor-save]");
  const revert = root.querySelector("[data-terminal-editor-revert]");
  const dirty = terminalEditorDirty(tab);
  if (save) {
    save.disabled = !dirty || tab.saving;
    save.querySelector("span").textContent = tab.saving ? "Saving..." : "Save";
  }
  if (revert) revert.disabled = !dirty;
  const changed = terminalEditorChangedLines(tab);
  const changeStatus = root.querySelector("[data-terminal-editor-change-status]");
  if (changeStatus) {
    changeStatus.textContent = dirty
      ? `${changed.size} changed line${changed.size === 1 ? "" : "s"}`
      : "Saved";
  }
  root.querySelector(`[data-terminal-editor-tab-dirty="${CSS.escape(tab.key)}"]`)
    ?.classList.toggle("visible", dirty);
}
function bindTerminalEditor(root = document.querySelector("[data-terminal-editor]")) {
  if (!root) return;
  const workspaceTerminalId = activeTerminalId || activeTerminalEditorTab()?.terminalId;
  if (workspaceTerminalId && !terminalEditorWorkspaces[workspaceTerminalId]?.loaded
    && !terminalEditorWorkspaceRequests[workspaceTerminalId]) {
    openTerminalEditorWorkspace(workspaceTerminalId);
  }
  root.querySelectorAll("[data-terminal-editor-file]").forEach((button) => button.addEventListener("click", () => void loadTerminalEditorFile(button.dataset.terminalEditorId, button.dataset.terminalEditorFile)));
  root.querySelectorAll("[data-terminal-editor-tab]").forEach((button) => button.addEventListener("click", () => { terminalEditorActiveKey = button.dataset.terminalEditorTab; refreshTerminalEditor(); }));
  root.querySelectorAll("[data-terminal-editor-close]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); closeTerminalEditorTab(button.dataset.terminalEditorClose); }));
  root.querySelector("[data-terminal-editor-save]")?.addEventListener("click", () => void saveTerminalEditorTab());
  root.querySelector("[data-terminal-editor-revert]")?.addEventListener("click", () => revertTerminalEditorTab());
  root.querySelector("[data-terminal-editor-reload]")?.addEventListener("click", () => {
    const tab = activeTerminalEditorTab();
    if (tab) void loadTerminalEditorFile(tab.terminalId, tab.path, tab.line, tab.column);
  });
  root.querySelector("[data-terminal-editor-refresh]")?.addEventListener("click", () => {
    const terminalId = activeTerminalId || activeTerminalEditorTab()?.terminalId;
    openTerminalEditorWorkspace(terminalId, true);
  });
  const input = root.querySelector("[data-terminal-editor-input]");
  const tab = activeTerminalEditorTab();
  if (input && tab && typeof mountTerminalEditorMonaco === "function") {
    void mountTerminalEditorMonaco(input, tab);
  }
}

function refreshTerminalEditorPosition(tab) {
  const label = document.querySelector("[data-terminal-editor-position]");
  if (label) label.textContent = `Ln ${tab.line}, Col ${tab.column}`;
}

function focusTerminalEditorLocation(tab, focus = true) {
  if (!tab || tab.key !== terminalEditorActiveKey) return;
  if (typeof terminalEditorFocusMonacoLocation === "function"
    && terminalEditorFocusMonacoLocation(tab, focus)) {
    refreshTerminalEditorPosition(tab);
  }
}
window.setInterval(async () => {
  const tab = activeTerminalEditorTab();
  if (terminalCompanionMode !== "editor" || !tab || tab.loading || tab.saving || terminalEditorDirty(tab)) return;
  try {
    const response = await fetch(terminalEditorApi(tab.terminalId, "file", tab.path));
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.file?.revision && result.file.revision !== tab.revision) {
      const cursor = { line: tab.line, column: tab.column };
      Object.assign(tab, result.file, {
        savedContent: result.file.content, diskChanged: false, error: "",
        line: cursor.line, column: cursor.column
      });
      refreshTerminalEditor();
    }
  } catch {}
}, 2500);
window.addEventListener?.("beforeunload", (event) => {
  if (!terminalEditorTabs.some(terminalEditorDirty)) return;
  event.preventDefault();
  event.returnValue = "";
});
