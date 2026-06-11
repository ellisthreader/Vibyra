const {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  session,
  shell,
  systemPreferences
} = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const { pickMemoryFiles } = require("./lib/desktopMemoryPicker.cjs");
const { pickDesktopProjectPath } = require("./lib/desktopProjectPicker.cjs");
const {
  discoverObsidianVaults,
  importDiscoveredObsidianVault
} = require("./lib/desktopObsidianDiscovery.cjs");
const {
  bindDesktopReloadShortcuts,
  reloadDesktopWindow,
  watchDesktopMainSources
} = require("./lib/electronReload.cjs");
const { createDesktopScreenshot } = require("./lib/desktopScreenshot.cjs");
const { createDesktopScreenshotSettings } = require("./lib/desktopScreenshotSettings.cjs");

const APP_NAME = "Vibyra";
const APP_ICON_PATH = path.join(__dirname, "vibyra-login-logo.png");
const LINUX_DESKTOP_NAME = "vibyra.desktop";

app.setName(APP_NAME);
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
if (process.platform === "linux") {
  app.setDesktopName(LINUX_DESKTOP_NAME);
  app.commandLine.appendSwitch("enable-features", "GlobalShortcutsPortal");
}
if (process.platform === "win32") {
  app.setAppUserModelId("app.vibyra.desktop");
}

const port = process.env.VIBYRA_AGENT_PORT || "4317";
const appUrl = process.env.VIBYRA_DESKTOP_URL || `http://127.0.0.1:${port}/desktop`;
let mainWindow;
let quitting = false;
let loadRetryTimer;
let loadRetryAttempt = 0;
let bridgeStartPending = false;
let bridgeHealthTimer;
let bridgeShutdownPending;
let bridgeShutdownComplete = false;
let handledRendererReloadRequestId = "";
let observedTerminalActionProtocolVersion = "";
let screenshotCapturePending = false;
let screenshotEditorOpen = false;
let screenshotShortcutAvailable = true;
let stopDesktopSourceWatch = () => {};

const screenshotSettings = createDesktopScreenshotSettings({ app, dialog });
const screenshotDirectory = () => screenshotSettings.directory();

const desktopScreenshot = createDesktopScreenshot({
  clipboard,
  desktopCapturer,
  dialog,
  globalShortcut,
  nativeImage,
  screen,
  getParentWindow: () => mainWindow,
  getScreenshotsDirectory: screenshotDirectory,
  screenAccessStatus: () => process.platform === "darwin"
    ? systemPreferences.getMediaAccessStatus("screen")
    : "granted",
  onShortcutError: (error) => sendScreenshotError(error)
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();

function revealWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function sendScreenshotError(error) {
  const message = error instanceof Error ? error.message : "Screenshot capture failed.";
  console.error(`Vibyra screenshot failed: ${message}`);
  mainWindow?.webContents?.send("screenshot:error", message);
}

async function captureScreenshotForEditor() {
  if (screenshotCapturePending || screenshotEditorOpen) return;
  screenshotCapturePending = true;
  console.log("Vibyra screenshot capture requested");
  try {
    const capture = await desktopScreenshot.captureDisplay();
    revealWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      throw new Error("Screenshot editor is unavailable.");
    }
    screenshotEditorOpen = true;
    mainWindow?.webContents?.send("screenshot:captured", {
      dataUrl: capture.dataUrl,
      displayId: String(capture.display.id)
    });
    console.log(`Vibyra screenshot editor opened for display ${capture.display.id}`);
  } catch (error) {
    screenshotEditorOpen = false;
    revealWindow();
    sendScreenshotError(error);
  } finally {
    screenshotCapturePending = false;
  }
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    revealWindow();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 860,
    minHeight: 620,
    backgroundColor: "#07070a",
    frame: false,
    icon: APP_ICON_PATH,
    title: APP_NAME,
    titleBarStyle: "hidden",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "electron-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  let revealed = false;
  const revealOnce = () => {
    if (revealed) return;
    revealed = true;
    revealWindow();
  };

  mainWindow.webContents.on("did-finish-load", async () => {
    screenshotEditorOpen = false;
    let loadedUrl = "";
    try {
      loadedUrl = await mainWindow.webContents.executeJavaScript("location.href", true);
    } catch {}
    if (!isDesktopPage(loadedUrl)) {
      ensureDesktopBridge();
      scheduleLoadRetry();
      return;
    }
    clearTimeout(loadRetryTimer);
    loadRetryAttempt = 0;
    if (!screenshotShortcutAvailable) {
      mainWindow.webContents.send("screenshot:error", "F9 is already used by another application.");
    }
    setTimeout(revealOnce, 100);
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame) return;
    console.error(`Vibyra Desktop failed to load ${url}: ${code} ${description}`);
    ensureDesktopBridge();
    scheduleLoadRetry();
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    screenshotEditorOpen = false;
    console.error(`Vibyra Desktop renderer exited: ${details.reason}`);
    if (!mainWindow || mainWindow.isDestroyed()) return;
    setTimeout(() => mainWindow?.reload(), 500);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url === "about:blank") return { action: "deny" };
    if (/^(https?:|mailto:)/i.test(url)) {
      void shell.openExternal(url);
      return { action: "deny" };
    }
    if (url.startsWith("blob:")) return { action: "allow" };
    return { action: "deny" };
  });
  bindDesktopReloadShortcuts(mainWindow);
  mainWindow.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on("closed", () => {
    clearTimeout(loadRetryTimer);
    screenshotEditorOpen = false;
    mainWindow = undefined;
  });

  mainWindow.loadURL(appUrl).catch((error) => {
    console.error(`Vibyra Desktop failed to open: ${error.message}`);
    ensureDesktopBridge();
    scheduleLoadRetry();
  });
}

function isDesktopPage(url) {
  try {
    const expected = new URL(appUrl);
    const loaded = new URL(url);
    const normalizedPath = (value) => value.replace(/\/+$/, "") || "/";
    return loaded.origin === expected.origin
      && normalizedPath(loaded.pathname) === normalizedPath(expected.pathname);
  } catch {
    return false;
  }
}

function ensureDesktopBridge() {
  if (bridgeStartPending || quitting) return;
  bridgeStartPending = true;
  const launch = isolatedLaunch(
    process.env.VIBYRA_NODE || "node",
    [path.join(__dirname, "local-app.mjs")]
  );
  const bridge = spawn(launch.command, launch.args, {
    detached: true,
    env: { ...process.env, VIBYRA_SKIP_DESKTOP_WINDOW: "1" },
    stdio: "ignore"
  });
  bridge.once("error", (error) => {
    console.error(`Vibyra Desktop could not restart its local bridge: ${error.message}`);
    bridgeStartPending = false;
  });
  bridge.once("exit", () => {
    bridgeStartPending = false;
  });
  bridge.unref();
}

function isolatedLaunch(command, args) {
  if (process.platform !== "linux") return { command, args };
  const closeDescriptors = "for path in /proc/$$/fd/*; do fd=${path##*/}; if [ \"$fd\" -gt 2 ] 2>/dev/null; then eval \"exec ${fd}>&-\"; fi; done; exec \"$@\"";
  return {
    command: "/bin/bash",
    args: ["-c", closeDescriptors, "vibyra-bridge", command, ...args]
  };
}

function startBridgeHealthMonitor() {
  if (bridgeHealthTimer) return;
  const check = () => {
    const request = http.get(`${new URL(appUrl).origin}/desktop/runtime`, { timeout: 1500 }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        ensureDesktopBridge();
        return;
      }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        if (body.length < 16384) body += chunk;
      });
      response.on("end", () => {
        try {
          const runtime = JSON.parse(body);
          const protocolVersion = String(runtime.terminalActionProtocolVersion || "");
          const requestId = String(runtime.rendererReloadRequestId || "");
          const protocolChanged = Boolean(
            protocolVersion
            && observedTerminalActionProtocolVersion
            && protocolVersion !== observedTerminalActionProtocolVersion
          );
          if (protocolVersion) observedTerminalActionProtocolVersion = protocolVersion;
          const reloadRequested = Boolean(
            requestId && requestId !== handledRendererReloadRequestId
          );
          if (requestId) handledRendererReloadRequestId = requestId;
          if (protocolChanged || reloadRequested) reloadDesktopWindow(mainWindow);
        } catch {
          ensureDesktopBridge();
        }
      });
    });
    request.on("timeout", () => request.destroy());
    request.on("error", ensureDesktopBridge);
  };
  check();
  bridgeHealthTimer = setInterval(check, 2000);
  bridgeHealthTimer.unref?.();
}

function stopDesktopBridge() {
  if (bridgeShutdownPending) return bridgeShutdownPending;
  bridgeShutdownPending = new Promise((resolve) => {
    const origin = new URL(appUrl).origin;
    const request = http.request(`${origin}/desktop/quit`, {
      method: "POST",
      headers: {
        "Content-Length": "0",
        Origin: origin
      },
      timeout: 1500
    }, (response) => {
      response.resume();
      response.on("end", resolve);
      response.on("close", resolve);
    });
    request.on("timeout", () => request.destroy());
    request.on("error", resolve);
    request.end();
  });
  return bridgeShutdownPending;
}

function scheduleLoadRetry() {
  if (quitting || !mainWindow || mainWindow.isDestroyed() || loadRetryTimer) return;
  loadRetryAttempt += 1;
  const delay = Math.min(5000, 250 * (2 ** Math.min(loadRetryAttempt - 1, 5)));
  loadRetryTimer = setTimeout(() => {
    loadRetryTimer = undefined;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.loadURL(appUrl).catch(() => scheduleLoadRetry());
  }, delay);
}

function configureDesktopPermissions() {
  const appOrigin = new URL(appUrl).origin;
  const requestOrigin = (webContents, details = {}) => {
    const candidate = details.requestingOrigin || details.securityOrigin || details.requestingUrl || webContents?.getURL?.() || "";
    try {
      return new URL(candidate).origin;
    } catch {
      return "";
    }
  };
  const isTrustedRequest = (webContents, permission, details = {}, requireAudioType = false) => {
    if (permission !== "media" || requestOrigin(webContents, details) !== appOrigin) return false;
    if (details.isMainFrame === false) return false;
    const mediaTypes = Array.isArray(details.mediaTypes)
      ? details.mediaTypes
      : details.mediaType ? [details.mediaType] : [];
    if (mediaTypes.includes("video")) return false;
    return !requireAudioType || mediaTypes.length > 0 && mediaTypes.every((type) => type === "audio");
  };
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details = {}) => (
    isTrustedRequest(webContents, permission, { ...details, requestingOrigin })
  ));
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(isTrustedRequest(webContents, permission, details, true));
  });
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("before-quit", (event) => {
    quitting = true;
    clearInterval(bridgeHealthTimer);
    desktopScreenshot.unregisterF9Shortcut();
    stopDesktopSourceWatch();
    if (bridgeShutdownComplete) return;
    event.preventDefault();
    void stopDesktopBridge().finally(() => {
      bridgeShutdownComplete = true;
      app.quit();
    });
  });
  app.on("second-instance", () => reloadDesktopWindow(mainWindow));
  app.whenReady().then(() => {
    if (process.platform === "darwin") app.dock.setIcon(APP_ICON_PATH);
    configureDesktopPermissions();
    startBridgeHealthMonitor();
    createWindow();
    stopDesktopSourceWatch = watchDesktopMainSources(app, [
      __filename,
      path.join(__dirname, "electron-preload.cjs"),
      path.join(__dirname, "lib/desktopScreenshot.cjs"),
      path.join(__dirname, "lib/desktopScreenshotSettings.cjs"),
      path.join(__dirname, "lib/electronReload.cjs")
    ]);
    screenshotShortcutAvailable = desktopScreenshot.registerF9Shortcut(captureScreenshotForEditor);
    if (!screenshotShortcutAvailable) {
      sendScreenshotError(new Error("F9 is already used by another application."));
    } else {
      console.log("Vibyra screenshot shortcut registered: F9");
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("window:maximize", () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  }
  mainWindow.maximize();
  return true;
});

ipcMain.handle("window:close", () => {
  mainWindow?.hide();
});

ipcMain.handle("memory:pick", async (_event, kind) => {
  if (!mainWindow || mainWindow.isDestroyed()) return { canceled: true, files: [] };
  return pickMemoryFiles(dialog, mainWindow, kind === "vault" ? "vault" : "markdown");
});

ipcMain.handle("projects:pick", async (event, kind) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    return { canceled: true, path: "" };
  }
  return pickDesktopProjectPath(dialog, mainWindow, kind === "file" ? "file" : "folder");
});

ipcMain.handle("memory:discover-obsidian", () => discoverObsidianVaults());
ipcMain.handle("memory:import-discovered-vault", (_event, id) => importDiscoveredObsidianVault(id));
ipcMain.on("screenshot:editor-state", (event, open) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return;
  screenshotEditorOpen = open === true;
});
ipcMain.handle("screenshot:copy", (_event, dataUrl) => {
  try {
    desktopScreenshot.copyPngDataUrl(dataUrl);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Copy failed." };
  }
});
ipcMain.handle("screenshot:copy-saved", async (_event, filePath) => {
  try {
    await desktopScreenshot.copySavedScreenshot(filePath);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Copy failed." };
  }
});
ipcMain.handle("screenshot:save", async (_event, dataUrl) => {
  try {
    return { ok: true, screenshot: await desktopScreenshot.savePngDataUrl(dataUrl) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Save failed." };
  }
});
ipcMain.handle("screenshot:settings", () => ({
  ok: true,
  ...screenshotSettings.state()
}));
ipcMain.handle("screenshot:choose-directory", async () => {
  try {
    return { ok: true, ...(await screenshotSettings.choose(mainWindow)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Screenshot folder could not be changed." };
  }
});
ipcMain.handle("screenshot:reset-directory", () => ({
  ok: true,
  ...screenshotSettings.reset()
}));
ipcMain.handle("screenshot:reveal", (_event, filePath) => {
  if (typeof filePath !== "string" || !filePath) return { ok: false };
  const directory = path.resolve(screenshotDirectory());
  const target = path.resolve(filePath);
  if (!target.startsWith(`${directory}${path.sep}`)) return { ok: false };
  shell.showItemInFolder(target);
  return { ok: true };
});
