const terminalTestViewportStorageKey = "vibyra.desktop.testViewports";
let terminalTestProjectRecommendation = null;

function setTerminalTestProjectRecommendation(recommendation) {
  terminalTestProjectRecommendation = recommendation || null;
}

function saveTerminalTestViewportState(projectId = terminalTestProjectId, targetId = terminalTestTargetId) {
  const key = terminalTestViewportKey(projectId, targetId);
  if (!key) return;
  const states = readTerminalTestViewportStates();
  states[key] = {
    preset: terminalTestPreset,
    width: terminalTestWidth,
    height: terminalTestHeight,
    zoom: terminalTestZoom,
    landscape: terminalTestLandscape,
    detectedLabel: terminalTestDetectedLabel,
    updatedAt: Date.now()
  };
  const trimmed = Object.fromEntries(Object.entries(states)
    .sort((left, right) => Number(right[1]?.updatedAt || 0) - Number(left[1]?.updatedAt || 0))
    .slice(0, 80));
  localStorage.setItem(terminalTestViewportStorageKey, JSON.stringify(trimmed));
}

function restoreTerminalTestViewportState(targetId = terminalTestTargetId) {
  const state = readTerminalTestViewportStates()[terminalTestViewportKey(terminalTestProjectId, targetId)];
  if (!state) {
    applyTerminalTestRecommendation(terminalTestProjectRecommendation);
    saveTerminalTestViewportState(terminalTestProjectId, targetId);
    return false;
  }
  const preset = terminalTestPresets.find((item) => item.key === state.preset);
  terminalTestPreset = preset?.key || terminalTestPreset;
  terminalTestWidth = boundedViewportNumber(state.width, 240, 3840, terminalTestWidth);
  terminalTestHeight = boundedViewportNumber(state.height, 320, 2160, terminalTestHeight);
  terminalTestZoom = boundedViewportNumber(state.zoom, .55, 1.6, terminalTestZoom);
  terminalTestLandscape = Boolean(state.landscape);
  terminalTestDetectedLabel = String(state.detectedLabel || "");
  return true;
}

function selectTerminalTestViewport(targetId) {
  saveTerminalTestViewportState();
  terminalTestTargetId = String(targetId || "");
  restoreTerminalTestViewportState(terminalTestTargetId);
}

function persistTerminalTestViewportControls() {
  localStorage.setItem("vibyra.desktop.testPreset", terminalTestPreset);
  localStorage.setItem("vibyra.desktop.testWidth", String(terminalTestWidth));
  localStorage.setItem("vibyra.desktop.testHeight", String(terminalTestHeight));
  localStorage.setItem("vibyra.desktop.testZoom", String(terminalTestZoom));
  localStorage.setItem("vibyra.desktop.testLandscape", String(terminalTestLandscape));
  saveTerminalTestViewportState();
}

function readTerminalTestViewportStates() {
  try {
    const value = JSON.parse(localStorage.getItem(terminalTestViewportStorageKey) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function terminalTestViewportKey(projectId, targetId) {
  const project = String(projectId || "");
  const target = String(targetId || "");
  return project && target ? `${project}\n${target}` : "";
}

function boundedViewportNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}
