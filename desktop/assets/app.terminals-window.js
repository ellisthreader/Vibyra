const terminalFullscreenKey = "vibyra.desktop.fullscreenTerminal";
const terminalCommonNames = [
  "Alex", "Avery", "Cameron", "Casey", "Charlie", "Jamie",
  "Jordan", "Morgan", "Riley", "Robin", "Sam", "Taylor"
];
let fullscreenTerminalId = localStorage.getItem(terminalFullscreenKey) || "";
let terminalFullscreenEscapeBound = false;

function terminalRandomName() {
  const used = new Set(terminals.map((terminal) => String(terminal.title || "").toLowerCase()));
  const available = terminalCommonNames.filter((name) => !used.has(name.toLowerCase()));
  const choices = available.length ? available : terminalCommonNames;
  return choices[Math.floor(Math.random() * choices.length)] || "Alex";
}

function terminalAgentDisplayName(terminal) {
  const key = typeof normalizeTerminalAgent === "function"
    ? normalizeTerminalAgent(terminal?.agent)
    : String(terminal?.agent || "vibyra");
  const agent = typeof terminalAgents !== "undefined"
    ? terminalAgents.find((item) => item.key === key)
    : null;
  return `${agent?.label || "Vibyra"} agent`;
}

function terminalWindowActions(terminal) {
  const fullscreen = fullscreenTerminalId === terminal.id;
  const title = escapeAttribute(terminal.title || "terminal");
  return `<div class="terminal-window-actions">
    <button type="button" data-terminal-fullscreen="${escapeAttribute(terminal.id)}" aria-label="${fullscreen ? "Exit full screen for" : "Full screen"} ${title}" aria-pressed="${fullscreen}" title="${fullscreen ? "Exit full screen" : "Full screen"}">${icon(fullscreen ? "contract" : "expand")}</button>
    <button type="button" data-terminal-settings="${escapeAttribute(terminal.id)}" aria-label="Terminal details for ${title}" title="Terminal details">${icon("menu")}</button>
    <button class="terminal-window-close" type="button" data-terminal-close="${escapeAttribute(terminal.id)}" aria-label="Close ${title}" title="Close terminal">${icon("close")}</button>
  </div>`;
}

function terminalFullscreenClasses(terminal) {
  if (!fullscreenTerminalId) return "";
  return fullscreenTerminalId === terminal.id
    ? " terminal-fullscreen"
    : " terminal-fullscreen-hidden";
}

function syncTerminalFullscreenState() {
  if (fullscreenTerminalId && !findTerminal(fullscreenTerminalId)) {
    fullscreenTerminalId = "";
    localStorage.removeItem(terminalFullscreenKey);
  }
}

function toggleTerminalFullscreen(id) {
  if (!findTerminal(id)) return;
  fullscreenTerminalId = fullscreenTerminalId === id ? "" : id;
  activeTerminalId = id;
  settingsTerminalId = "";
  if (fullscreenTerminalId) localStorage.setItem(terminalFullscreenKey, fullscreenTerminalId);
  else localStorage.removeItem(terminalFullscreenKey);
  saveTerminals();
  forceTerminalRender = true;
  render();
}

function bindTerminalFullscreenControls(root = document) {
  root.querySelectorAll?.("[data-terminal-fullscreen]").forEach((button) => {
    if (button.dataset.terminalFullscreenBound) return;
    button.dataset.terminalFullscreenBound = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleTerminalFullscreen(button.dataset.terminalFullscreen);
    });
  });
  if (terminalFullscreenEscapeBound) return;
  terminalFullscreenEscapeBound = true;
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !fullscreenTerminalId) return;
    fullscreenTerminalId = "";
    localStorage.removeItem(terminalFullscreenKey);
    forceTerminalRender = true;
    render();
  });
}
