import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const state = readFileSync(new URL("./app.screenshot-state.js", import.meta.url), "utf8");
const tools = readFileSync(new URL("./app.screenshot-tools.js", import.meta.url), "utf8");
const view = readFileSync(new URL("./app.screenshot-view.js", import.meta.url), "utf8");
const runtime = readFileSync(new URL("./app.screenshot.js", import.meta.url), "utf8");
const tray = readFileSync(new URL("./app.screenshot-tray.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("./app.screenshot.css", import.meta.url), "utf8");
const trayStyles = readFileSync(new URL("./app.screenshot-tray.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.html", import.meta.url), "utf8");
const preload = readFileSync(new URL("../electron-preload.cjs", import.meta.url), "utf8");
const profileScreenshots = readFileSync(new URL("./app.profile-screenshots.js", import.meta.url), "utf8");
const profileRender = readFileSync(new URL("./app.profile-render.js", import.meta.url), "utf8");
const profileActions = readFileSync(new URL("./app.profile-actions.js", import.meta.url), "utf8");

test("screenshot editor exposes the focused crop and annotation workflow", () => {
  assert.match(view, /Crop/);
  assert.match(view, /Box/);
  assert.match(view, /Pen/);
  assert.match(view, /Apply crop/);
  assert.match(view, /Copy/);
  assert.match(view, /Save/);
  assert.match(view, /Apply changes/);
  assert.match(tools, /setPointerCapture/);
  assert.match(state, /drawScreenshotCrop/);
  assert.match(state, /slice\(-6\)/);
});

test("screenshot editor is keyboard accessible and renderer isolated", () => {
  assert.match(runtime, /event\.key === "Escape"/);
  assert.match(runtime, /event\.key\.toLowerCase\(\) === "s"/);
  assert.match(runtime, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(runtime, /"1": "crop", "2": "box", "3": "pen"/);
  assert.match(runtime, /screenshotEditorGeneration/);
  assert.match(runtime, /generation === screenshotEditorGeneration && !root\.hidden/);
  assert.match(runtime, /function closeScreenshotEditor\(\) \{\s+screenshotEditorGeneration \+= 1;/);
  assert.match(state, /shouldCommit && !shouldCommit\(\)/);
  assert.match(view, /role="dialog"/);
  assert.match(view, /aria-modal="true"/);
  assert.match(view, /aria-live="polite"/);
  assert.match(styles, /touch-action: none/);
  assert.match(styles, /\.screenshot-editor-host\s*\{[^}]*-webkit-app-region:\s*no-drag/s);
  assert.match(styles, /\.screenshot-editor-host\s*\{[^}]*z-index:\s*1000/s);
  assert.match(styles, /\.screenshot-editor button,\s*\[data-screenshot-canvas\]\s*\{[^}]*pointer-events:\s*auto/s);
  assert.match(styles, /\[data-screenshot-apply-crop\]\[hidden\]\s*\{\s*display: none/);
});

test("screenshot editor is wired through a narrow Electron preload API", () => {
  assert.match(preload, /vibyraDesktopScreenshot/);
  assert.match(preload, /screenshot:copy/);
  assert.match(preload, /screenshot:copy-saved/);
  assert.match(preload, /screenshot:save/);
  assert.match(preload, /screenshot:settings/);
  assert.match(preload, /screenshot:choose-directory/);
  assert.match(preload, /screenshot:reset-directory/);
  assert.doesNotMatch(preload, /screenshot:recent/);
  assert.match(preload, /screenshot:reveal/);
  assert.match(preload, /screenshot:editor-state/);
  assert.match(preload, /screenshot:captured/);
  assert.match(app, /app\.screenshot\.css/);
  assert.match(app, /app\.screenshot\.css\?v=screenshot-controls-20260610/);
  assert.match(app, /app\.screenshot-state\.js/);
  assert.match(app, /app\.screenshot\.js/);
  assert.match(app, /app\.screenshot-tray\.js/);
  assert.doesNotMatch(tray, /Screenshot saved/);
  assert.doesNotMatch(tray, /item\.name/);
  assert.match(tray, /data-screenshot-reveal/);
  assert.match(tray, /data-screenshot-copy/);
  assert.match(tray, /copySaved\(item\.filePath\)/);
  assert.match(tray, /draggable="true"/);
  assert.match(tray, /preview\.ondragstart/);
  assert.match(tray, /application\/x-vibyra-screenshot-path/);
  assert.match(tray, /setData\("text\/plain", path\)/);
  assert.match(tray, /shellQuotedScreenshotPath\(filePath\)/);
  assert.doesNotMatch(tray, /event\.preventDefault\(\)/);
  assert.match(tray, /draggable="false"/);
  assert.match(tray, /\[\.\.\.screenshotTrayState\.items\]\.reverse\(\)/);
  assert.match(tray, /items\.map/);
  assert.match(tray, /dismissSavedScreenshot\(item\.filePath\)/);
  assert.match(tray, /function clearSavedScreenshotTray\(\)/);
  assert.doesNotMatch(tray, /loadSavedScreenshotTray/);
  assert.doesNotMatch(tray, /localStorage/);
  assert.doesNotMatch(tray, /\.recent/);
  assert.match(trayStyles, /flex-direction:\s*column/);
  assert.match(trayStyles, /\.screenshot-tray-item/);
  assert.match(trayStyles, /cursor:\s*grab/);
});

test("closing during an in-flight screenshot load stays closed", async () => {
  let releaseLoad;
  let focusCount = 0;
  const editorStates = [];
  const classes = new Set();
  const host = { hidden: true };
  const root = {
    hidden: true,
    closest: () => host,
    querySelector: () => ({ focus: () => { focusCount += 1; } })
  };
  const screenshotState = {
    crop: {},
    documentCanvas: {},
    drag: {},
    history: ["pending"],
    originalDataUrl: "pending"
  };
  const loadBarrier = new Promise((resolve) => {
    releaseLoad = resolve;
  });
  const context = vm.createContext({
    clearTimeout,
    setTimeout,
    screenshotState,
    ensureScreenshotEditor: () => root,
    selectScreenshotTool: () => {},
    showScreenshotNotice: () => {},
    loadScreenshotDocument: async (_dataUrl, _resetOriginal, shouldCommit) => {
      await loadBarrier;
      return shouldCommit();
    },
    document: {
      body: {
        dataset: {},
        classList: {
          add: (name) => classes.add(name),
          remove: (name) => classes.delete(name)
        }
      },
      querySelector: (selector) => selector === "[data-screenshot-editor]" ? root : null,
      addEventListener: () => {}
    },
    window: {
      vibyraDesktopScreenshot: {
        setEditorOpen: (open) => editorStates.push(open)
      }
    }
  });
  vm.runInContext(runtime.replace(/bindDesktopScreenshot\(\);\s*$/, ""), context);

  const opening = vm.runInContext(
    'openScreenshotEditor({ dataUrl: "data:image/png;base64,pending" })',
    context
  );
  vm.runInContext("closeScreenshotEditor(); closeScreenshotEditor();", context);
  releaseLoad();
  await opening;

  assert.equal(root.hidden, true);
  assert.equal(host.hidden, true);
  assert.equal(classes.has("screenshot-editing"), false);
  assert.equal(focusCount, 0);
  assert.deepEqual(editorStates, [true, false]);
  assert.equal(screenshotState.documentCanvas, null);
});

test("saved screenshot cards are current-session only", () => {
  const context = vm.createContext({});
  vm.runInContext(tray, context);

  assert.deepEqual(
    [...vm.runInContext("screenshotTrayState.items", context)],
    []
  );
});

test("Preferences exposes a persisted native screenshot folder picker", () => {
  assert.match(app, /app\.profile-screenshots\.js\?v=screenshot-directory-20260610/);
  assert.match(profileRender, /profileScreenshotSettingsPanel\(\)/);
  assert.match(profileRender, /ensureProfileScreenshotSettings/);
  assert.match(profileScreenshots, /Screenshot folder/);
  assert.match(profileScreenshots, /chooseDirectory/);
  assert.match(profileScreenshots, /resetDirectory/);
  assert.match(profileScreenshots, /clearSavedScreenshotTray\(\)/);
  assert.match(profileActions, /change-screenshot-folder/);
  assert.match(profileActions, /reset-screenshot-folder/);
});
