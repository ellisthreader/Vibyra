function syncTerminalTestProjectContext(force = false) {
  if (!terminalTestOpen || terminalCompanionMode !== "preview") return;
  const projectId = terminalTestContextProjectId();
  if (projectId === terminalTestProjectId && (terminalTestLoading || !force)) return;
  terminalTestRequest += 1;
  clearTerminalTestInspector();
  saveTerminalTestViewportState();
  terminalTestProjectId = projectId;
  terminalTestUrl = "";
  terminalTestLaunch = null;
  clearTerminalTestRunner();
  clearTerminalTestTargets();
  clearTerminalTestRecommendation();
  if (projectId) {
    void loadTerminalProjectPreview(projectId);
    return;
  }
  terminalTestStatus = "";
  syncTerminalTestWorkspace();
}

window.addEventListener("vibyra:terminal-companion-context", () => {
  if (terminalTestOpen && terminalCompanionMode === "preview") syncTerminalTestProjectContext();
});
