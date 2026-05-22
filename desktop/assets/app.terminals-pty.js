const terminalPtySockets = {};
const terminalPtyRenderTimers = {};
const terminalXterms = {};
const terminalXtermSizes = {};
let ptyRenderedSignature = "";
const terminalPtyRendererVersion = 2;
const terminalAgents = [
  { key: "vibyra", label: "Vibyra", detail: "OpenRouter terminal", profile: "auto" },
  { key: "codex", label: "Codex", detail: "OpenAI Codex CLI", profile: "openai" },
  { key: "claude", label: "Claude", detail: "Claude Code CLI", profile: "claude" },
  { key: "gemini", label: "Gemini", detail: "Gemini CLI", profile: "gemini" },
  { key: "shell", label: "Shell", detail: "Login shell", profile: "auto" }
];
let setupAgent = localStorage.getItem("vibyra.desktop.terminalAgent") || "vibyra";

function agentForModel(model) {
  const provider = typeof terminalProviderKeyForModel === "function"
    ? terminalProviderKeyForModel(model)
    : String(model?.provider || "").toLowerCase();
  return ["openai", "claude", "gemini"].includes(provider) ? "official" : "vibyra";
}

function normalizePtyAgentForModel(item, terminal) {
  const agent = normalizeTerminalAgent(item.agent || terminal.agent);
  const modelKey = String(item.model || terminal.model || "").trim();
  if (modelKey && modelKey !== "auto") return agentForModel(terminalModelForDisplay(modelKey));
  return agent;
}

const previousNormalizeTerminal = normalizeTerminal;
normalizeTerminal = function normalizePtyTerminal(item) {
  const terminal = previousNormalizeTerminal(item);
  if (!terminal) return null;
  terminal.agent = normalizePtyAgentForModel(item, terminal);
  terminal.agentStatus = item.agentStatus || null;
  const rendererVersion = Number(item.ptyRendererVersion || 0);
  const currentRenderer = rendererVersion === terminalPtyRendererVersion;
  terminal.ptyRendererVersion = terminalPtyRendererVersion;
  terminal.cwd = String(item.cwd || "");
  terminal.output = currentRenderer ? String(item.output || "").slice(-60000) : "";
  terminal.ptyStatus = currentRenderer ? String(item.ptyStatus || item.status || "idle") : "exited";
  terminal.exitCode = Number.isFinite(Number(item.exitCode)) ? Number(item.exitCode) : null;
  return terminal;
};

saveTerminals = function savePtyTerminals() {
  const stored = terminals.map(({ pending, notice, ptyStartQueued, ...terminal }) => ({ ...terminal, ptyRendererVersion: terminalPtyRendererVersion, output: String(terminal.output || "").slice(-60000) })).slice(0, maxTerminals);
  localStorage.setItem(storageKey, JSON.stringify(stored));
  if (activeTerminalId) localStorage.setItem(activeKey, activeTerminalId);
  else localStorage.removeItem(activeKey);
  localStorage.setItem(layoutKey, terminalLayout);
  localStorage.setItem("vibyra.desktop.terminalAgent", setupAgent);
};

terminalProviderProfile = function terminalPtyProviderProfile(terminal) {
  const provider = terminalProviderKeyForModel(terminal?.model);
  if (provider === "claude") return terminalProfiles.claude;
  if (provider === "openai") return terminalProfiles.openai;
  if (provider === "gemini") return terminalProfiles.gemini;
  return terminalProfiles.auto;
};

modelMetaChip = function terminalAgentMetaChip(terminal) {
  const model = terminalModelForDisplay(terminal.model);
  return `<span class="terminal-meta-chip terminal-model-chip">${modelLogo(model)}${escapeHtml(model.label)}</span>`;
};

createTerminal = function createPtyTerminal(modelKey = setupModel, shouldRender = true) {
  if (terminals.length >= maxTerminals) return null;
  const model = unlockedModel(modelKey);
  const agent = agentForModel(model);
  const terminal = {
    id: terminalId(),
    title: `${model.label} ${terminals.length + 1}`,
    agent,
    agentStatus: null,
    model: model.key,
    effort: "medium",
    projectId: typeof selectedProjectId === "string" ? selectedProjectId : "",
    draft: "",
    shellMode: false,
    profileVersion: 1,
    ptyRendererVersion: terminalPtyRendererVersion,
    pending: true,
    notice: null,
    cwd: "",
    output: "",
    ptyStatus: "starting",
    exitCode: null,
    updatedAt: Date.now(),
    messages: []
  };
  terminals.unshift(terminal);
  activeTerminalId = terminal.id;
  if (terminals.length > 4) terminalLayout = "grid";
  newTerminalMenuOpen = false;
  setupModelMenuOpen = false;
  settingsTerminalId = "";
  saveTerminals();
  if (shouldRender) { forceTerminalRender = true; render(); }
  queueStartPtyTerminal(terminal);
  return terminal;
};

createTerminals = function createPtyTerminals(count = 1, modelKey = setupModel) {
  const total = Math.min(maxTerminals - terminals.length, normalizeCount(count));
  const model = unlockedModel(modelKey);
  if (terminals.length + total > 4) terminalLayout = "grid";
  for (let index = 0; index < total; index += 1) createTerminal(model.key, false);
  forceTerminalRender = true;
  render();
};

setupView = function ptySetupView() {
  const model = selectedSetupModel();
  return `<section class="terminal-setup"><div class="terminal-setup-panel"><div class="terminal-setup-copy"><span class="terminal-setup-icon">${icon("terminal")}</span><h2>Start AI terminals</h2></div><div class="terminal-setup-grid"><div class="terminal-setup-block"><p>How many?</p><div class="terminal-count-row">${[1, 2, 3, 4, 6, 12].map((count) => `<button class="${setupCount === count ? "active" : ""}" type="button" data-terminal-count="${count}">${count}</button>`).join("")}</div><label class="terminal-custom-count">${icon("edit")}<input type="number" min="1" max="${maxTerminals}" value="${setupCount}" data-terminal-custom-count aria-label="Custom terminal count" /><span>Custom</span></label></div><div class="terminal-setup-block terminal-preview-block"><p>Preview</p>${layoutPreview(setupCount)}</div></div><div class="terminal-setup-block"><p>Model</p><div class="terminal-model-select-wrap">${terminalModelSelectButton("setup", model)}${setupModelMenuOpen ? terminalModelMenu("setup", model.key) : ""}</div></div><button class="primary-button terminal-start-button" type="button" id="start-terminals">${icon("plus")}Open ${setupCount} terminal${setupCount === 1 ? "" : "s"}</button></div></section>`;
};

newTerminalMenu = function ptyNewTerminalMenu() {
  return terminalModelMenu("new", selectedSetupModel().key);
};

activeTerminalView = function ptyActiveTerminalView(terminal) {
  const active = terminal.id === activeTerminalId;
  const hiddenClass = active ? "active" : "terminal-focus-hidden";
  const hiddenAttr = active ? "" : " aria-hidden=\"true\"";
  return `<article class="terminal-focus ${terminalProviderClass(terminal)} ${hiddenClass} ${terminal.notice ? "has-notice" : ""}" data-terminal="${escapeAttribute(terminal.id)}"${hiddenAttr}><header class="terminal-focus-head"><div class="terminal-name"><span class="terminal-status ${terminal.pending || terminal.ptyStatus === "running" ? "running" : ""}"></span><strong>${escapeHtml(terminal.title)}</strong></div><div class="terminal-meta">${modelMetaChip(terminal)}<button class="terminal-settings-button" type="button" data-terminal-settings="${escapeAttribute(terminal.id)}" aria-label="Terminal settings" title="Terminal settings">${icon("menu")}</button>${settingsTerminalId === terminal.id ? settingsMenu(terminal) : ""}</div></header>${terminal.notice ? terminalNotice(terminal) : ""}${terminalViewport(terminal)}</article>`;
};

terminalFocusViews = function ptyTerminalFocusViews() {
  return terminals.map(activeTerminalView).join("");
};

terminalTile = function ptyTerminalTile(terminal) {
  const active = terminal.id === activeTerminalId;
  return `<article class="terminal-tile ${terminalProviderClass(terminal)} ${active ? "active" : ""}" data-terminal="${escapeAttribute(terminal.id)}"><header class="terminal-tile-head"><button type="button" data-terminal-focus="${escapeAttribute(terminal.id)}"><span class="terminal-status ${terminal.pending || terminal.ptyStatus === "running" ? "running" : ""}"></span><strong>${escapeHtml(terminal.title)}</strong></button><button class="terminal-settings-button" type="button" data-terminal-settings="${escapeAttribute(terminal.id)}" aria-label="Terminal settings">${icon("menu")}</button>${settingsTerminalId === terminal.id ? settingsMenu(terminal) : ""}</header>${terminalViewport(terminal)}</article>`;
};

function terminalViewport(terminal) {
  const unavailable = terminal.ptyStatus === "unavailable";
  return `<div class="terminal-lines terminal-pty-lines ${unavailable ? "terminal-pty-unavailable" : ""}" tabindex="0" data-terminal-input="${escapeAttribute(terminal.id)}">${unavailable ? `<pre>${escapeHtml(terminal.output || "")}</pre>` : `<div class="terminal-xterm" data-terminal-xterm="${escapeAttribute(terminal.id)}"></div>`}</div>`;
}

terminalComposer = function ptyTerminalComposer(terminal) {
  return "";
};

settingsMenu = function ptySettingsMenu(terminal) {
  const cwd = terminal.cwd ? `<div class="terminal-cwd-row">${icon("folder")}<span>${escapeHtml(terminal.cwd)}</span></div>` : "";
  return `<div class="terminal-menu terminal-settings-menu">${cwd}<button class="terminal-close-row" type="button" data-terminal-close="${escapeAttribute(terminal.id)}">${icon("trash")}Close terminal</button></div>`;
};

terminalTopbarSubtitle = function ptyTerminalTopbarSubtitle() {
  ensureTerminal();
  const running = terminals.filter((terminal) => terminal.ptyStatus === "running" || terminal.pending).length;
  return `${terminals.length}/${maxTerminals}${running ? ` running ${running}` : ""}`;
};

terminalTabs = function ptyTerminalTabs() {
  const tabs = terminals.map((terminal, index) => {
    const running = terminal.pending || terminal.ptyStatus === "starting" || terminal.ptyStatus === "running";
    return `<div class="terminal-tab ${terminal.id === activeTerminalId ? "active" : ""}" draggable="true" data-terminal-drag="${escapeAttribute(terminal.id)}" title="${escapeAttribute(terminal.title)}"><button class="terminal-tab-open" type="button" data-terminal-focus="${escapeAttribute(terminal.id)}" aria-label="Open ${escapeAttribute(terminal.title)}"><span class="terminal-status ${running ? "running" : ""}"></span><span>${index + 1}</span></button><button class="terminal-tab-close" type="button" data-terminal-close="${escapeAttribute(terminal.id)}" aria-label="Close ${escapeAttribute(terminal.title)}">${icon("close")}</button></div>`;
  }).join("");
  return `<header class="terminal-tabs"><div class="terminal-new-wrap"><button class="terminal-add" id="open-terminal-new" type="button" aria-label="New terminal" title="New terminal" ${terminals.length >= maxTerminals ? "disabled" : ""}>${icon("plus")}</button>${newTerminalMenuOpen ? newTerminalMenu() : ""}</div><div class="terminal-tab-list">${tabs}</div><button class="terminal-layout-button" id="toggle-terminal-layout" type="button" aria-label="Toggle terminal layout" title="${terminalLayout === "grid" ? "Focus view" : "Grid view"}">${icon(terminalLayout === "grid" ? "terminal" : "grid")}</button></header>`;
};

const previousBindTerminalControls = bindTerminalControls;
bindTerminalControls = function bindPtyTerminalControls() {
  previousBindTerminalControls();
  document.querySelectorAll("[data-terminal-agent]").forEach((button) => button.addEventListener("click", () => { setupAgent = normalizeTerminalAgent(button.dataset.terminalAgent); render(); }));
  document.querySelectorAll("[data-terminal-new-agent]").forEach((button) => button.addEventListener("click", () => createTerminal(button.dataset.terminalNewAgent || setupAgent, true)));
  document.querySelectorAll("[data-terminal-input]").forEach((node) => {
    if (node.dataset.ptyInputBound) return;
    node.dataset.ptyInputBound = "1";
    node.addEventListener("keydown", (event) => handlePtyKeydown(event, node.dataset.terminalInput));
    node.addEventListener("paste", (event) => {
      event.preventDefault();
      sendPtyInput(node.dataset.terminalInput, event.clipboardData?.getData("text") || "");
    });
    node.addEventListener("pointerdown", () => focusPtyTerminal(node.dataset.terminalInput));
    node.addEventListener("click", () => focusPtyTerminal(node.dataset.terminalInput));
  });
  document.querySelectorAll("[data-terminal]").forEach((node) => {
    if (node.dataset.ptyFocusBound) return;
    node.dataset.ptyFocusBound = "1";
    node.addEventListener("pointerdown", (event) => {
      if (event.target?.closest?.("button, select, option, .terminal-menu")) return;
      focusPtyTerminal(node.dataset.terminal);
    });
  });
  mountVisibleXterms();
};

const previousCloseTerminal = closeTerminal;
closeTerminal = function closePtyTerminal(id) {
  const socket = terminalPtySockets[id];
  if (socket) socket.close();
  terminalXterms[id]?.dispose?.();
  delete terminalXterms[id];
  delete terminalXtermSizes[id];
  delete terminalPtySockets[id];
  fetch(`/desktop/pty-terminals/${encodeURIComponent(id)}/close`, { method: "POST" }).catch(() => {});
  previousCloseTerminal(id);
};
