terminals = loadTerminals();
activeTerminalId = localStorage.getItem(activeKey) || terminals[0]?.id || "";
ensureTerminal();
if (activeTerminalId && typeof rememberActiveTerminalForProject === "function") {
  rememberActiveTerminalForProject(findTerminal(activeTerminalId));
}
saveTerminals();
window.renderTerminalsPage = renderTerminalsPage;
window.terminalTopbarSubtitle = terminalTopbarSubtitle;
window.terminalTopbarHtml = terminalTopbarHtml;
if (typeof render === "function" && activePage === "terminals") render();
