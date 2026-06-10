function terminalCompanionDisplayTerminal() {
  const terminal = terminalCompanionActiveTerminal();
  if (terminal) return terminal;
  const projectId = typeof terminalProjectForSetup === "function" ? terminalProjectForSetup() : "";
  return {
    effort: setupEffort,
    model: setupModel,
    projectId,
    title: ""
  };
}

function syncTerminalCompanionContext() {
  const terminal = terminalCompanionActiveTerminal();
  const displayTerminal = terminalCompanionDisplayTerminal();
  const projectId = displayTerminal.projectId || "";
  const nextKey = `${terminal?.id || "setup"}:${projectId}`;
  if (nextKey === terminalCompanionContextKey) return;
  terminalCompanionContextKey = nextKey;
  if (typeof syncTerminalVoiceTarget === "function") syncTerminalVoiceTarget(terminal);
  if (terminalCompanionMode && typeof terminalMemoryEnsureProject === "function") {
    terminalMemoryEnsureProject(projectId);
    queueMicrotask(() => {
      if (typeof terminalMemoryRefresh === "function") terminalMemoryRefresh();
    });
  }
  window.dispatchEvent(new CustomEvent("vibyra:terminal-companion-context", {
    detail: { mode: terminalCompanionMode, terminalId: terminal?.id || "", projectId }
  }));
}
