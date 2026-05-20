const terminalPtySockets = {};
const terminalPtyRenderTimers = {};
const terminalXterms = {};
const terminalAgents = [
  { key: "codex", label: "Codex", detail: "OpenAI Codex CLI", profile: "openai" },
  { key: "claude", label: "Claude", detail: "Claude Code CLI", profile: "claude" },
  { key: "gemini", label: "Gemini", detail: "Gemini CLI", profile: "gemini" },
  { key: "shell", label: "Shell", detail: "Login shell", profile: "auto" }
];
let setupAgent = localStorage.getItem("vibyra.desktop.terminalAgent") || "codex";

const previousNormalizeTerminal = normalizeTerminal;
normalizeTerminal = function normalizePtyTerminal(item) {
  const terminal = previousNormalizeTerminal(item);
  if (!terminal) return null;
  terminal.agent = normalizeTerminalAgent(item.agent || terminal.agent);
  terminal.agentStatus = item.agentStatus || null;
  terminal.cwd = String(item.cwd || "");
  terminal.output = String(item.output || "").slice(-60000);
  terminal.ptyStatus = String(item.ptyStatus || item.status || "idle");
  terminal.exitCode = Number.isFinite(Number(item.exitCode)) ? Number(item.exitCode) : null;
  return terminal;
};

saveTerminals = function savePtyTerminals() {
  const stored = terminals.map(({ pending, notice, ...terminal }) => ({ ...terminal, output: String(terminal.output || "").slice(-60000) })).slice(0, maxTerminals);
  localStorage.setItem(storageKey, JSON.stringify(stored));
  if (activeTerminalId) localStorage.setItem(activeKey, activeTerminalId);
  else localStorage.removeItem(activeKey);
  localStorage.setItem(layoutKey, terminalLayout);
  localStorage.setItem("vibyra.desktop.terminalAgent", setupAgent);
};

terminalProviderProfile = function terminalPtyProviderProfile(terminal) {
  const profileKey = terminalAgent(terminal).profile;
  return terminalProfiles[profileKey] || terminalProfiles.auto;
};

modelMetaChip = function terminalAgentMetaChip(terminal) {
  const agent = terminalAgent(terminal);
  return `<span class="terminal-meta-chip terminal-model-chip">${icon("terminal")}${escapeHtml(agent.label)}</span>`;
};

createTerminal = function createPtyTerminal(agentKey = setupAgent, shouldRender = true) {
  if (terminals.length >= maxTerminals) return null;
  const agent = normalizeTerminalAgent(terminalAgentKeyOrSetup(agentKey));
  const terminal = {
    id: terminalId(),
    title: `${terminalAgent({ agent }).label} ${terminals.length + 1}`,
    agent,
    agentStatus: null,
    model: agentDefaultModel(agent),
    effort: "medium",
    projectId: typeof selectedProjectId === "string" ? selectedProjectId : "",
    draft: "",
    shellMode: false,
    profileVersion: 1,
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
  newTerminalMenuOpen = false;
  setupModelMenuOpen = false;
  settingsTerminalId = "";
  void startPtyTerminal(terminal);
  saveTerminals();
  if (shouldRender) { forceTerminalRender = true; render(); }
  return terminal;
};

createTerminals = function createPtyTerminals(count = 1, agentKey = setupAgent) {
  const total = Math.min(maxTerminals - terminals.length, normalizeCount(count));
  const agent = terminalAgentKeyOrSetup(agentKey);
  for (let index = 0; index < total; index += 1) createTerminal(agent, false);
  forceTerminalRender = true;
  render();
};

setupView = function ptySetupView() {
  return `<section class="terminal-setup"><div class="terminal-setup-panel"><div class="terminal-setup-copy"><span class="terminal-setup-icon">${icon("terminal")}</span><h2>Start agent terminals</h2></div><div class="terminal-setup-grid"><div class="terminal-setup-block"><p>How many?</p><div class="terminal-count-row">${[1, 2, 3, 4, 6, 12].map((count) => `<button class="${setupCount === count ? "active" : ""}" type="button" data-terminal-count="${count}">${count}</button>`).join("")}</div><label class="terminal-custom-count">${icon("edit")}<input type="number" min="1" max="${maxTerminals}" value="${setupCount}" data-terminal-custom-count aria-label="Custom terminal count" /><span>Custom</span></label></div><div class="terminal-setup-block terminal-preview-block"><p>Preview</p>${layoutPreview(setupCount)}</div></div><div class="terminal-setup-block"><p>Agent</p><div class="terminal-agent-row">${terminalAgents.map(agentButton).join("")}</div></div><button class="primary-button terminal-start-button" type="button" id="start-terminals">${icon("plus")}Open ${setupCount} ${terminalAgent({ agent: setupAgent }).label} terminal${setupCount === 1 ? "" : "s"}</button></div></section>`;
};

newTerminalMenu = function ptyNewTerminalMenu() {
  return `<div class="terminal-menu terminal-agent-menu">${terminalAgents.map((agent) => agentButton(agent).replace(/data-terminal-agent=/g, "data-terminal-new-agent=")).join("")}</div>`;
};

activeTerminalView = function ptyActiveTerminalView(terminal) {
  return `<article class="terminal-focus ${terminalProviderClass(terminal)} ${terminal.notice ? "has-notice" : ""}" data-terminal="${escapeAttribute(terminal.id)}"><header class="terminal-focus-head"><div class="terminal-name"><span class="terminal-status ${terminal.pending || terminal.ptyStatus === "running" ? "running" : ""}"></span><strong>${escapeHtml(terminal.title)}</strong></div><div class="terminal-meta">${modelMetaChip(terminal)}<button class="terminal-settings-button" type="button" data-terminal-settings="${escapeAttribute(terminal.id)}" aria-label="Terminal settings" title="Terminal settings">${icon("menu")}</button>${settingsTerminalId === terminal.id ? settingsMenu(terminal) : ""}</div></header>${terminal.notice ? terminalNotice(terminal) : ""}${terminalViewport(terminal)}${terminalComposer(terminal)}</article>`;
};

terminalTile = function ptyTerminalTile(terminal) {
  const active = terminal.id === activeTerminalId;
  return `<article class="terminal-tile ${terminalProviderClass(terminal)} ${active ? "active" : ""}" data-terminal="${escapeAttribute(terminal.id)}"><header class="terminal-tile-head"><button type="button" data-terminal-focus="${escapeAttribute(terminal.id)}"><span class="terminal-status ${terminal.pending || terminal.ptyStatus === "running" ? "running" : ""}"></span><strong>${escapeHtml(terminal.title)}</strong></button><button class="terminal-settings-button" type="button" data-terminal-settings="${escapeAttribute(terminal.id)}" aria-label="Terminal settings">${icon("menu")}</button>${settingsTerminalId === terminal.id ? settingsMenu(terminal) : ""}</header>${terminalViewport(terminal)}${terminalComposer(terminal)}</article>`;
};

function terminalViewport(terminal) {
  const unavailable = terminal.ptyStatus === "unavailable";
  return `<div class="terminal-lines terminal-pty-lines ${unavailable ? "terminal-pty-unavailable" : ""}" tabindex="0" data-terminal-input="${escapeAttribute(terminal.id)}">${unavailable ? `<pre>${escapeHtml(terminal.output || "")}</pre>` : `<div class="terminal-xterm" data-terminal-xterm="${escapeAttribute(terminal.id)}"></div>`}</div>`;
}

terminalComposer = function ptyTerminalComposer(terminal) {
  const copy = terminal.ptyStatus === "unavailable" ? "CLI unavailable" : terminal.ptyStatus === "exited" ? "Exited. Use the menu to close this terminal." : "Click the terminal and type normally";
  return `<div class="terminal-composer-wrap"><div class="terminal-composer terminal-pty-composer" tabindex="0" data-terminal-input="${escapeAttribute(terminal.id)}"><span class="terminal-composer-prompt" aria-hidden="true">${escapeHtml(terminalProviderProfile(terminal).promptToken || ">")}</span><span>${escapeHtml(copy)}</span></div></div>`;
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

const previousBindTerminalControls = bindTerminalControls;
bindTerminalControls = function bindPtyTerminalControls() {
  previousBindTerminalControls();
  document.querySelectorAll("[data-terminal-agent]").forEach((button) => button.addEventListener("click", () => { setupAgent = normalizeTerminalAgent(button.dataset.terminalAgent); render(); }));
  document.querySelectorAll("[data-terminal-new-agent]").forEach((button) => button.addEventListener("click", () => createTerminal(button.dataset.terminalNewAgent || setupAgent, true)));
  document.querySelectorAll("[data-terminal-input]").forEach((node) => {
    node.addEventListener("keydown", (event) => handlePtyKeydown(event, node.dataset.terminalInput));
    node.addEventListener("paste", (event) => {
      event.preventDefault();
      sendPtyInput(node.dataset.terminalInput, event.clipboardData?.getData("text") || "");
    });
    node.addEventListener("click", () => terminalXterms[node.dataset.terminalInput]?.focus());
  });
  mountVisibleXterms();
};

const previousCloseTerminal = closeTerminal;
closeTerminal = function closePtyTerminal(id) {
  const socket = terminalPtySockets[id];
  if (socket) socket.close();
  terminalXterms[id]?.dispose?.();
  delete terminalXterms[id];
  delete terminalPtySockets[id];
  fetch(`/desktop/pty-terminals/${encodeURIComponent(id)}/close`, { method: "POST" }).catch(() => {});
  previousCloseTerminal(id);
};
