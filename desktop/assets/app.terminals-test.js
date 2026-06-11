const previousRenderTerminalsPageForTest = renderTerminalsPage;
renderTerminalsPage = function renderTerminalsPageWithTest() {
  previousRenderTerminalsPageForTest();
  syncTerminalTestWorkspace();
};
const previousBindPtyTopbarControlsForTest = bindPtyTopbarControls;
bindPtyTopbarControls = function bindPtyTopbarControlsWithTest() {
  previousBindPtyTopbarControlsForTest();
  const workspace = document.querySelector("[data-terminal-test-workspace]");
  if (workspace) bindTerminalTestTopbar(workspace);
};
const previousSetActiveTerminalForTest = setActiveTerminal;
setActiveTerminal = function setActiveTerminalFromTest(id) {
  const result = previousSetActiveTerminalForTest(id);
  if (terminalTestOpen && terminalCompanionMode === "preview") {
    queueMicrotask(() => syncTerminalTestProjectContext());
  }
  syncTerminalTestWorkspace();
  return result;
};
const previousOpenTerminalCompanionForTest = openTerminalCompanionPanel;
openTerminalCompanionPanel = function openTerminalCompanionFromTest(mode, source) {
  const openingPreview = mode === "preview" && terminalCompanionMode !== "preview";
  terminalTestOpen = mode === "preview";
  const result = previousOpenTerminalCompanionForTest(mode, source);
  if (terminalTestOpen) queueMicrotask(() => syncTerminalTestProjectContext(openingPreview));
  syncTerminalTestLaunchers();
  return result;
};
const previousCloseTerminalCompanionForTest = closeTerminalCompanionPanel;
closeTerminalCompanionPanel = function closeTerminalCompanionFromTest() {
  terminalTestOpen = false;
  const result = previousCloseTerminalCompanionForTest();
  syncTerminalTestLaunchers();
  return result;
};
const previousSetPageForTest = setPage;
setPage = function setPageFromTest(page) {
  if (page !== "terminals") terminalTestOpen = false;
  return previousSetPageForTest(page);
};
function openTerminalTest() {
  terminalTestOpen = true;
  openTerminalCompanionPanel("preview", "toolbar");
}
function closeTerminalTest() {
  terminalTestOpen = false;
  if (terminalCompanionMode === "preview") closeTerminalCompanionPanel();
  requestAnimationFrame(() => {
    if (typeof mountVisibleXterms === "function") mountVisibleXterms();
    if (activeTerminalId && typeof focusPtyTerminal === "function") focusPtyTerminal(activeTerminalId);
  });
}
function syncTerminalTestLaunchers() {}
function syncTerminalTestWorkspace() {
  if (activePage !== "terminals" || !nodes?.content) return;
  const test = nodes.content.querySelector("[data-terminal-test-workspace]");
  if (!terminalTestOpen || terminalCompanionMode !== "preview" || !test) return;
  if (!test) return;
  bindTerminalTestWorkspace(test);
  bindTerminalTestTopbar(test);
  refreshTerminalTestWorkspace(test);
}
function bindTerminalTestWorkspace(root) {
  if (root.dataset.bound) return;
  root.dataset.bound = "1";
  root.querySelector("[data-terminal-test-zoom-out]").addEventListener("click", () => updateTerminalTestZoom(terminalTestZoom - .15, root));
  root.querySelector("[data-terminal-test-zoom-in]").addEventListener("click", () => updateTerminalTestZoom(terminalTestZoom + .15, root));
  root.querySelector("[data-terminal-test-fit]").addEventListener("click", () => updateTerminalTestZoom(1, root));
  root.querySelector("[data-terminal-test-start-server]").addEventListener("click", runTerminalTestTargetAction);
  root.querySelector("[data-terminal-test-runner-retry]").addEventListener("click", () => void startTerminalProjectPreview(terminalTestLaunch));
  root.querySelector("[data-terminal-test-targets]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-terminal-test-target-id]");
    if (button) selectTerminalTestTarget(button.dataset.terminalTestTargetId);
  });
  bindTerminalTestConsole(root);
  root.querySelector("[data-terminal-test-frame-content]").addEventListener("load", () => {
    clearTerminalTestInspector(false);
    postTerminalTestDevice(root);
    if (!terminalTestRefreshing) return;
    terminalTestRefreshing = false;
    terminalTestStatus = "Live preview";
    refreshTerminalTestWorkspace(root);
  });
  new ResizeObserver(() => syncTerminalTestScale(root)).observe(root.querySelector("[data-terminal-test-canvas]"));
}

function bindTerminalTestTopbar(root) {
  const toolbar = document.querySelector("[data-terminal-test-toolbar]");
  if (!toolbar || toolbar.dataset.bound) return;
  toolbar.dataset.bound = "1";
  bindCustomSelects(toolbar);
  toolbar.querySelector("[data-terminal-test-url-form]").addEventListener("submit", (event) => {
    event.preventDefault();
    saveTerminalTestViewportState();
    terminalTestProjectId = "";
    clearTerminalTestRunner();
    clearTerminalTestTargets();
    clearTerminalTestRecommendation();
    terminalTestRequest += 1;
    const url = terminalTestNormalizeUrl(toolbar.querySelector("[data-terminal-test-url]")?.value);
    setTerminalTestUrl(url, url ? "Custom web preview" : "Enter a valid HTTP or HTTPS URL.");
  });
  toolbar.querySelector("[data-terminal-test-preset]").addEventListener("change", (event) => {
    clearTerminalTestRecommendation();
    terminalTestPreset = event.target.value;
    persistTerminalTestViewportControls();
    refreshTerminalTestWorkspace(root);
  });
  toolbar.querySelector("[data-terminal-test-target]").addEventListener("change", (event) => {
    selectTerminalTestTarget(event.target.value);
  });
  toolbar.querySelector("[data-terminal-test-width]").addEventListener("change", (event) => updateTerminalTestCustom("width", event.target.value, root));
  toolbar.querySelector("[data-terminal-test-height]").addEventListener("change", (event) => updateTerminalTestCustom("height", event.target.value, root));
  toolbar.querySelector("[data-terminal-test-rotate]").addEventListener("click", () => {
    clearTerminalTestRecommendation();
    terminalTestLandscape = !terminalTestLandscape;
    persistTerminalTestViewportControls();
    refreshTerminalTestWorkspace(root);
  });
  toolbar.querySelector("[data-terminal-test-refresh]").addEventListener("click", () => refreshTerminalTestPreview(root));
}

function refreshTerminalTestWorkspace(root) {
  const toolbar = document.querySelector("[data-terminal-test-toolbar]");
  const preset = terminalTestActivePreset();
  const size = terminalTestViewportSize(preset);
  if (toolbar) {
    toolbar.querySelector("[data-terminal-test-url]").value = terminalTestUrl;
    setCustomSelectValue(toolbar.querySelector("[data-terminal-test-preset]"), terminalTestPreset);
    toolbar.querySelector("[data-terminal-test-custom]").hidden = terminalTestPreset !== "custom";
    toolbar.querySelector("[data-terminal-test-width]").value = terminalTestWidth;
    toolbar.querySelector("[data-terminal-test-height]").value = terminalTestHeight;
  }
  if (toolbar) {
    toolbar.querySelector("[data-terminal-test-auto]").hidden = !terminalTestDetectedLabel;
    const rotate = toolbar.querySelector("[data-terminal-test-rotate]");
    const rotateLabel = terminalTestLandscape ? "Rotate to portrait" : "Rotate to landscape";
    rotate.setAttribute("aria-label", rotateLabel);
    rotate.title = rotateLabel;
    toolbar.querySelector("[data-terminal-test-refresh]").disabled = !terminalTestUrl || terminalTestRefreshing;
    toolbar.querySelector("[data-terminal-test-refresh]").classList.toggle("is-loading", terminalTestRefreshing);
    refreshTerminalTestTargetControl(toolbar);
  }
  syncTerminalTestDeviceFrame(root, preset, size);
  setTerminalTestFrameUrl(root, terminalTestUrl);
  refreshTerminalTestRunner(root);
  refreshTerminalTestConsole(root);
  refreshTerminalTestInspector(root);
  syncTerminalTestScale(root);
}

function updateTerminalTestZoom(value, root) {
  terminalTestZoom = Math.max(.55, Math.min(1.6, Math.round(value * 20) / 20));
  persistTerminalTestViewportControls();
  syncTerminalTestScale(root);
}

async function loadTerminalProjectPreview(projectId) {
  const request = ++terminalTestRequest;
  let launch = null;
  saveTerminalTestViewportState();
  terminalTestUrl = "";
  terminalTestLaunch = null;
  clearTerminalTestTargets();
  clearTerminalTestRecommendation();
  beginTerminalTestLoading(null, "Inspecting project files...");
  try {
    const result = await terminalTestPost("/desktop/preview", { projectId });
    if (request !== terminalTestRequest) return;
    const preview = result.preview || {};
    setTerminalTestProjectRecommendation(preview.recommendation);
    terminalTestTargets = Array.isArray(preview.targets) ? preview.targets : [];
    applyTerminalTestServiceState(preview);
    terminalTestTargetId = terminalTestActiveTargetId
      || terminalTestTargets.find((target) => target.available)?.id
      || terminalTestTargets[0]?.id
      || "";
    restoreTerminalTestViewportState(terminalTestTargetId);
    launch = preview.url ? null : terminalTestSelectedTarget() || preview.launch;
    terminalTestLaunch = launch;
    setTerminalTestUrl(preview.url || terminalTestService()?.url || "", preview.message || "Preview unavailable");
    finishTerminalTestLoading();
  } catch (error) {
    if (request === terminalTestRequest) {
      const message = error.message || "Preview unavailable";
      setTerminalTestUrl("", message);
      finishTerminalTestLoading(message);
    }
  }
}

function setTerminalTestUrl(value, status) {
  if (terminalTestUrl !== terminalTestIsolatedUrl(value)) clearTerminalTestInspector();
  terminalTestUrl = terminalTestIsolatedUrl(value);
  terminalTestStatus = status || (terminalTestUrl ? "Live preview" : "Preview unavailable");
  syncTerminalTestWorkspace();
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && terminalTestOpen && terminalCompanionMode === "preview") closeTerminalTest();
});
