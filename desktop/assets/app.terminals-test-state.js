let terminalTestOpen = false;
let terminalTestProjectId = "";
let terminalTestUrl = "";
let terminalTestStatus = "";
let terminalTestLoading = false;
let terminalTestDetectedLabel = "";
let terminalTestLandscape = localStorage.getItem("vibyra.desktop.testLandscape") === "true";
const storedTerminalTestPreset = localStorage.getItem("vibyra.desktop.testPreset") || "";
let terminalTestPreset = terminalTestPresetAliases[storedTerminalTestPreset] || storedTerminalTestPreset || "iphone-15-pro";
let terminalTestWidth = Number(localStorage.getItem("vibyra.desktop.testWidth")) || 1280;
let terminalTestHeight = Number(localStorage.getItem("vibyra.desktop.testHeight")) || 800;
let terminalTestZoom = Number(localStorage.getItem("vibyra.desktop.testZoom")) || 1;
let terminalTestRequest = 0;
let terminalTestTargets = [];
let terminalTestTargetId = "";
let terminalTestServices = {};
let terminalTestActiveTargetId = "";
let terminalTestTargetPendingId = "";
let terminalTestStartupOutput = "";

function terminalTestActivePreset() {
  return terminalTestPresets.find((preset) => preset.key === terminalTestPreset) || terminalTestPresets[6];
}

function terminalTestViewportSize(preset = terminalTestActivePreset()) {
  const width = preset.key === "custom" ? terminalTestWidth : preset.width;
  const height = preset.key === "custom" ? terminalTestHeight : preset.height;
  return terminalTestLandscape ? { width: height, height: width } : { width, height };
}

function terminalTestNormalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) return new URL(raw, window.location.origin).toString();
    const local = /^(?:localhost|127\.|0\.0\.0\.0|\[?::1\]?|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(raw);
    return new URL(`${local ? "http" : "https"}://${raw}`).toString();
  } catch {
    return "";
  }
}

function terminalTestIsolatedUrl(value) {
  const normalized = terminalTestNormalizeUrl(value);
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    if (url.origin === window.location.origin) url.hostname = "preview.localhost";
    return url.toString();
  } catch {
    return "";
  }
}

function terminalTestSandbox(value) {
  const base = "allow-downloads allow-forms allow-modals allow-pointer-lock allow-scripts";
  try { return new URL(value).origin === window.location.origin ? base : `${base} allow-same-origin`; } catch { return base; }
}

function terminalTestContextProjectId() {
  const terminalProjectId = terminalCompanionDisplayTerminal?.()?.projectId;
  const activeProjectKey = typeof activeTerminalProjectKey === "function" ? activeTerminalProjectKey() : "";
  const currentProjectId = typeof currentProject === "function" ? currentProject()?.id : "";
  const candidates = [terminalProjectId, activeProjectKey, setupProjectId, currentProjectId, selectedProjectId];
  return String(candidates.find((value) => value && value !== "full-pc" && value !== "__unassigned__") || "");
}

function terminalTestSelectedTarget() {
  return terminalTestTargets.find((target) => target.id === terminalTestTargetId) || null;
}

function terminalTestService(targetId = terminalTestTargetId) {
  return terminalTestServices[String(targetId || "")] || null;
}

function terminalTestServiceRunning(service = terminalTestService()) {
  if (!service) return false;
  if (typeof service.running === "boolean") return service.running;
  if (service.state) return service.state === "running";
  if (service.status) return service.status === "running";
  return Boolean(service.url);
}

function terminalTestServiceStarting(service = terminalTestService()) {
  return service?.state === "starting" || service?.status === "starting";
}

function applyTerminalTestServiceState(preview = {}) {
  const collection = preview.services || preview.running || {};
  const entries = Array.isArray(collection)
    ? collection.map((service) => [service?.targetId || service?.id, service])
    : Object.entries(collection);
  terminalTestServices = Object.fromEntries(entries.filter(([targetId]) => targetId).map(([targetId, value]) => {
    const service = typeof value === "boolean"
      ? { running: value }
      : typeof value === "string" ? { status: value } : { ...(value || {}) };
    service.targetId = String(service.targetId || service.id || targetId);
    service.running = terminalTestServiceRunning(service);
    return [String(targetId), service];
  }));
  terminalTestActiveTargetId = String(
    preview.activeTargetId
    || preview.active?.targetId
    || preview.activeTarget?.id
    || Object.values(terminalTestServices).find((service) => service.active)?.targetId
    || ""
  );
}

function terminalTestTargetAction() {
  const target = terminalTestSelectedTarget();
  if (!target?.available) return null;
  if (terminalTestServiceStarting()) return null;
  const running = terminalTestServiceRunning();
  if (!running) return { kind: "run", label: `Run ${target.name}` };
  if (target.id === terminalTestActiveTargetId) return { kind: "stop", label: `Stop ${target.name}` };
  return { kind: "view", label: `View ${target.name}` };
}

async function terminalTestPost(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) throw new Error(result.error || "Preview request failed");
  return result;
}

function updateTerminalTestCustom(field, value, root) {
  clearTerminalTestRecommendation();
  const next = Math.round(Number(value) || (field === "width" ? 1280 : 800));
  if (field === "width") terminalTestWidth = Math.min(3840, Math.max(240, next));
  else terminalTestHeight = Math.min(2160, Math.max(320, next));
  persistTerminalTestViewportControls();
  refreshTerminalTestWorkspace(root);
}

function syncTerminalTestScale(root) {
  const canvas = root.querySelector("[data-terminal-test-canvas]");
  const frame = root.querySelector("[data-terminal-test-frame]");
  const size = terminalTestViewportSize();
  const fit = Math.min(1, Math.max(0.1, (canvas.clientWidth - 40) / size.width), Math.max(0.1, (canvas.clientHeight - 90) / size.height));
  const scale = Math.max(0.1, Math.min(1.5, fit * terminalTestZoom));
  frame.style.setProperty("--test-scale", String(scale));
  const output = root.querySelector("[data-terminal-test-zoom-value]");
  if (output) output.textContent = `${Math.round(scale * 100)}%`;
}
