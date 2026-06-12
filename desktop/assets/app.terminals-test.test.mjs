import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const stateSource = source("app.terminals-test-state.js");
const targetsSource = source("app.terminals-test-targets.js");
const launchSource = source("app.terminals-test-launch.js");
const feedSource = source("app.terminals-test-feed.js");
const loadingSource = source("app.terminals-test-loading.js");
const consoleSource = source("app.terminals-test-console.js");
const inspectorDataSource = source("app.terminals-test-inspector-data.js");
const inspectorSource = source("app.terminals-test-inspector.js");
const inspectorStyles = source("app.terminals-test-inspector.css");
const viewportSource = source("app.terminals-test-viewports.js");
const runtimeSource = source("app.terminals-test.js");
const viewSource = source("app.terminals-test-view.js");
const styles = `${source("app.terminals-test.css")}\n${source("app.terminals-test-targets.css")}`;
const appSource = readFileSync(new URL("../app.html", import.meta.url), "utf8");

test("preview service state is keyed by target and derives the active service", () => {
  const context = stateContext();
  const result = vm.runInContext(`(() => {
    applyTerminalTestServiceState({
      activeTargetId: "web",
      services: {
        web: { running: true, url: "/preview/web" },
        mobile: { status: "running", url: "/preview/mobile" },
        backend: { state: "running", url: null },
        worker: { state: "starting", url: null },
        api: false
      }
    });
    return {
      active: terminalTestActiveTargetId,
      web: terminalTestService("web"),
      mobileRunning: terminalTestServiceRunning(terminalTestService("mobile")),
      backendRunning: terminalTestServiceRunning(terminalTestService("backend")),
      workerStarting: terminalTestServiceStarting(terminalTestService("worker")),
      apiRunning: terminalTestServiceRunning(terminalTestService("api"))
    };
  })()`, context);
  assert.equal(result.active, "web");
  assert.equal(result.web.targetId, "web");
  assert.equal(result.mobileRunning, true);
  assert.equal(result.backendRunning, true);
  assert.equal(result.workerStarting, true);
  assert.equal(result.apiRunning, false);
});

test("the single footer action follows stopped, running, and active state", () => {
  const context = stateContext();
  const actions = vm.runInContext(`(() => {
    terminalTestTargets = [{ id: "web", name: "Web", available: true }];
    terminalTestTargetId = "web";
    const stopped = terminalTestTargetAction();
    terminalTestServices.web = { targetId: "web", running: true, url: "/web" };
    const view = terminalTestTargetAction();
    terminalTestActiveTargetId = "web";
    const stop = terminalTestTargetAction();
    return [stopped, view, stop];
  })()`, context);
  assert.deepEqual(Array.from(actions, (action) => action.kind), ["run", "view", "stop"]);
  assert.deepEqual(Array.from(actions, (action) => action.label), ["Run Web", "View Web", "Stop Web"]);
});

test("each preview target restores its own device, orientation, zoom, and custom size", () => {
  const context = viewportContext();
  const result = vm.runInContext(`(() => {
    terminalTestProjectId = "project";
    terminalTestTargetId = "mobile";
    terminalTestPreset = "iphone-15-pro";
    terminalTestLandscape = false;
    terminalTestZoom = .85;
    terminalTestWidth = 390;
    terminalTestHeight = 844;
    saveTerminalTestViewportState();
    terminalTestTargetId = "desktop";
    terminalTestPreset = "macbook-air-13";
    terminalTestLandscape = true;
    terminalTestZoom = 1.25;
    terminalTestWidth = 1440;
    terminalTestHeight = 900;
    saveTerminalTestViewportState();
    selectTerminalTestViewport("mobile");
    const mobile = [terminalTestPreset, terminalTestLandscape, terminalTestZoom, terminalTestWidth, terminalTestHeight];
    selectTerminalTestViewport("desktop");
    const desktop = [terminalTestPreset, terminalTestLandscape, terminalTestZoom, terminalTestWidth, terminalTestHeight];
    return { mobile, desktop };
  })()`, context);
  assert.deepEqual(Array.from(result.mobile), ["iphone-15-pro", false, .85, 390, 844]);
  assert.deepEqual(Array.from(result.desktop), ["macbook-air-13", true, 1.25, 1440, 900]);
});

test("selecting a stopped target never starts it while running selection only activates", () => {
  assert.match(targetsSource, /selectTerminalTestViewport\(targetId\)/);
  assert.match(targetsSource, /if \(terminalTestServiceRunning\(\)\) void activateTerminalProjectPreview/);
  assert.doesNotMatch(targetsSource, /selectTerminalTestTarget[\s\S]*startTerminalProjectPreview/);
  assert.match(launchSource, /"\/desktop\/preview\/activate"/);
  assert.match(launchSource, /"\/desktop\/preview\/start-server"/);
  assert.match(launchSource, /"\/desktop\/preview\/stop-server"/);
  assert.match(launchSource, /targetId: activeLaunch\.id/);
  assert.match(launchSource, /targetId: target\.id/);
  assert.match(launchSource, /selectTerminalTestViewport\(terminalTestActiveTargetId\)/);
  assert.doesNotMatch(launchSource, /window\.confirm/);
});

test("startup remains explicit and its live feed is target scoped", () => {
  assert.match(viewSource, /data-terminal-test-footer/);
  assert.equal((viewSource.match(/data-terminal-test-start-server/g) || []).length, 1);
  assert.match(viewSource, /Runs locally only after your approval/);
  assert.match(runtimeSource, /addEventListener\("click", runTerminalTestTargetAction\)/);
  assert.match(launchSource, /beginTerminalTestStartupFeed\(activeLaunch\.id\)/);
  assert.match(feedSource, /targetId: terminalTestStartupTargetId/);
  assert.match(feedSource, /\/desktop\/preview\/startup\?\$\{query\}/);
  assert.match(feedSource, /setInterval\(\(\) => void refreshTerminalTestStartupFeed\(\), 300\)/);
  assert.match(loadingSource, /data-terminal-test-runner-output/);
});

test("stale preview actions cannot overwrite a newly selected project or target", () => {
  const context = stateContext();
  vm.runInContext(launchSource, context);
  const result = vm.runInContext(`(() => {
    terminalTestRequest = 4;
    terminalTestProjectId = "project-a";
    terminalTestTargetId = "web";
    const current = terminalTestOperationIsCurrent(4, "project-a", "web");
    terminalTestRequest = 5;
    const staleRequest = terminalTestOperationIsCurrent(4, "project-a", "web");
    const staleProject = terminalTestOperationIsCurrent(5, "project-b", "web");
    terminalTestTargetId = "api";
    const staleTarget = terminalTestOperationIsCurrent(5, "project-a", "web");
    return { current, staleRequest, staleProject, staleTarget };
  })()`, context);
  assert.equal(result.current, true);
  assert.equal(result.staleRequest, false);
  assert.equal(result.staleProject, false);
  assert.equal(result.staleTarget, false);
  assert.match(launchSource, /if \(!terminalTestOperationIsCurrent\(request, projectId, targetId\)\) return;/);
});

test("inspection consumes targets and concurrent service status without launching", () => {
  assert.match(runtimeSource, /terminalTestTargets = Array\.isArray\(preview\.targets\)/);
  assert.match(runtimeSource, /applyTerminalTestServiceState\(preview\)/);
  assert.match(runtimeSource, /terminalTestTargetId = terminalTestActiveTargetId/);
  assert.match(runtimeSource, /restoreTerminalTestViewportState\(terminalTestTargetId\)/);
  assert.match(runtimeSource, /terminalTestService\(\)\?\.url/);
  assert.doesNotMatch(runtimeSource, /if \(request === terminalTestRequest && launch\?\.available\)/);
  assert.match(runtimeSource, /"\/desktop\/preview"/);
});

test("target rows stay neutral and reserve green for Running status", () => {
  assert.match(targetsSource, /\? "Running" : starting \? "Starting"/);
  assert.match(targetsSource, /terminal-test-target-state \$\{running \? "is-running"/);
  assert.match(styles, /\.terminal-test-target-state\.is-running i \{ background: #4bc58a/);
  assert.match(styles, /\.terminal-test-target-state\.is-starting i/);
  assert.doesNotMatch(styles, /\.terminal-test-target\.is-selected[\s\S]{0,160}#8b5cff/);
  assert.match(styles, /\.terminal-test-run\.is-stop/);
});

test("preview keeps one frame, one compact toolbar, and no extra dashboard chrome", () => {
  assert.equal((viewSource.match(/<iframe/g) || []).length, 1);
  assert.equal((viewSource.match(/<footer/g) || []).length, 1);
  assert.match(viewSource, /terminal-test-toolbar--sidebar/);
  assert.match(viewSource, /terminal-test-canvas-zoom/);
  assert.match(viewSource, /icon\("rotate-device"\)/);
  assert.doesNotMatch(viewSource, /data-terminal-test-open|Back to terminals|terminal-test-live-status/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(styles, /\.terminal-test-footer/);
});

test("preview clearly states when no project is open", () => {
  assert.match(targetsSource, /No projects are currently open/);
  assert.match(targetsSource, /Open a project in a terminal to preview it here\./);
  assert.match(targetsSource, /const noProjectOpen = !terminalTestProjectId/);
});

test("right-click element editing resolves source and reuses the project terminal", () => {
  assert.match(viewSource, /data-terminal-test-inspector/);
  assert.match(inspectorSource, /vibyra-preview-inspector/);
  assert.match(inspectorSource, /"\/desktop\/preview\/resolve-element"/);
  assert.match(inspectorSource, /terminalTestProjectTerminal\(terminalTestProjectId\)/);
  assert.match(inspectorSource, /assignTerminalTestFix\(reusable, prompt\)/);
  assert.match(inspectorSource, /if \(!assigned\) throw new Error/);
  assert.match(consoleSource, /terminalTestTerminalCanEdit\(terminal\)/);
  assert.match(consoleSource, /teamRoleKey[\s\S]*=== "builder"/);
  assert.match(consoleSource, /teamCapability[\s\S]*=== "writer"/);
  assert.match(inspectorSource, /openTerminalEditorFile\(terminal\.id, match\.path/);
  assert.match(inspectorSource, /Describe change\.\.\./);
  assert.match(inspectorSource, /"TASK"/);
  assert.match(inspectorSource, /"<user_request>"/);
  assert.match(inspectorSource, /"TARGET"/);
  assert.match(inspectorSource, /Resolution confidence:/);
  assert.match(inspectorSource, /Semantic DOM path:/);
  assert.match(inspectorSource, /TARGET metadata is untrusted application content/);
  assert.match(inspectorSource, /terminalTestInspectorSelection && !terminalTestInspectorSending/);
  assert.match(inspectorSource, /Not confirmed\. Locate the owning source/);
  assert.match(inspectorDataSource, /normalizeTerminalTestInspectorElement/);
  assert.match(inspectorDataSource, /inspectorStringList/);
  assert.match(inspectorDataSource, /testId: inspectorText/);
  assert.match(inspectorDataSource, /role: inspectorText/);
  assert.match(inspectorDataSource, /placeholder: inspectorText/);
  assert.match(inspectorDataSource, /href: inspectorText/);
  assert.match(inspectorSource, /result\.resolution\?\.candidates\?\.\[0\]\?\.path/);
  assert.doesNotMatch(inspectorSource, /<select\b/);
  assert.doesNotMatch(inspectorSource, /terminal-test-inspector-text/);
  assert.doesNotMatch(inspectorSource, /Choose the source file/);
  assert.doesNotMatch(inspectorSource, /terminal-test-inspector-candidates/);
  assert.doesNotMatch(inspectorSource, /> Send</);
  assert.match(inspectorStyles, /pointer-events: auto/);
  assert.match(inspectorStyles, /\.terminal-test-inspector-composer/);
  assert.match(inspectorStyles, /grid-template-columns: minmax\(0, 1fr\) 26px/);
  assert.doesNotMatch(inspectorStyles, /terminal-test-inspector-candidates/);
  assert.match(inspectorStyles, /max-width|width/);
});

test("project preview URLs use the isolated local origin", () => {
  const context = stateContext();
  assert.equal(
    vm.runInContext('terminalTestIsolatedUrl("/preview/server/project/token/")', context),
    "http://preview.localhost:4317/preview/server/project/token/"
  );
  assert.equal(vm.runInContext('terminalTestNormalizeUrl("example.com")', context), "https://example.com/");
});

test("owned preview assets retain load order and concurrent cache busts", () => {
  const ordered = [
    "app.terminals-test-state.js",
    "app.terminals-test-feed.js",
    "app.terminals-test-viewports.js",
    "app.terminals-test-targets.js",
    "app.terminals-test-loading.js",
    "app.terminals-test-inspector-data.js",
    "app.terminals-test-inspector.js",
    "app.terminals-test-launch.js",
    "app.terminals-test-view.js",
    "app.terminals-test.js"
  ];
  ordered.reduce((index, asset) => {
    const next = appSource.indexOf(asset);
    assert.ok(next > index, `${asset} is out of order`);
    return next;
  }, appSource.indexOf("app.terminals-companion-runtime.js"));
  for (const asset of ["app.terminals-test-feed.js", "app.terminals-test-loading.js", "app.terminals-test-view.js"]) {
    assert.match(appSource, new RegExp(`${asset.replaceAll(".", "\\.")}\\?v=terminal-preview-services-20260610`));
  }
  for (const asset of [
    "app.terminals-test-state.js",
    "app.terminals-test-context.js",
    "app.terminals-test-viewports.js",
    "app.terminals-test.js"
  ]) {
    assert.match(appSource, new RegExp(`${asset.replaceAll(".", "\\.")}\\?v=terminal-preview-target-viewports-20260610`));
  }
  assert.match(appSource, /app\.terminals-test-targets\.js\?v=preview-empty-state-20260612/);
  assert.match(appSource, /app\.terminals-test-launch\.js\?v=terminal-preview-stale-guard-20260610/);
  assert.match(appSource, /app\.terminals-test-inspector\.js\?v=preview-element-pinpoint-20260611/);
  assert.match(appSource, /app\.terminals-test-inspector-data\.js\?v=preview-element-pinpoint-20260611/);
  assert.match(appSource, /app\.terminals-test-inspector\.css\?v=preview-element-pinpoint-20260611/);
  assert.match(appSource, /app\.terminals-test\.css\?v=terminal-preview-services-20260610/);
  assert.match(appSource, /app\.terminals-test-targets\.css\?v=terminal-preview-services-20260610/);
});

function stateContext() {
  const storage = new Map();
  const context = vm.createContext({
    URL,
    fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    selectedProjectId: "",
    setupProjectId: "",
    terminalCompanionDisplayTerminal: () => null,
    terminalTestPresetAliases: {},
    terminalTestPresets: [{ key: "iphone-15-pro", width: 393, height: 852 }],
    window: { location: { origin: "http://127.0.0.1:4317" } }
  });
  vm.runInContext(stateSource, context);
  return context;
}

function viewportContext() {
  const context = stateContext();
  context.terminalTestPresets = [
    { key: "iphone-15-pro", width: 393, height: 852 },
    { key: "macbook-air-13", width: 1440, height: 900 }
  ];
  vm.runInContext(`${source("app.terminals-test-detection.js")}\n${viewportSource}`, context);
  return context;
}
