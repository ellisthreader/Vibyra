const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("node:path");

app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");

const port = process.env.VIBYRA_AGENT_PORT || "4317";
const appUrl = process.env.VIBYRA_DESKTOP_URL || `http://127.0.0.1:${port}/desktop`;
let mainWindow;
let quitting = false;

const hasSingleInstanceLock = app.requestSingleInstanceLock();

function revealWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
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
    title: "Vibyra Desktop",
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

  mainWindow.once("ready-to-show", revealOnce);
  mainWindow.webContents.once("did-finish-load", () => setTimeout(revealOnce, 100));
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame) return;
    console.error(`Vibyra Desktop failed to load ${url}: ${code} ${description}`);
    revealOnce();
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(`Vibyra Desktop renderer exited: ${details.reason}`);
    if (!mainWindow || mainWindow.isDestroyed()) return;
    setTimeout(() => mainWindow?.reload(), 500);
  });
  mainWindow.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });

  const showFallback = setTimeout(revealOnce, 2000);
  showFallback.unref?.();

  mainWindow.loadURL(appUrl).catch((error) => {
    console.error(`Vibyra Desktop failed to open: ${error.message}`);
    revealOnce();
  });
}

function configureDesktopPermissions() {
  const appOrigin = new URL(appUrl).origin;
  const isTrustedRequest = (webContents, permission, details = {}) => {
    const origin = new URL(webContents.getURL() || appUrl).origin;
    const mediaTypes = Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
    return permission === "media" && origin === appOrigin && !mediaTypes.includes("video");
  };
  session.defaultSession.setPermissionCheckHandler((webContents, permission, _origin, details) => isTrustedRequest(webContents, permission, details));
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(isTrustedRequest(webContents, permission, details));
  });
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("before-quit", () => {
    quitting = true;
  });
  app.on("second-instance", revealWindow);
  app.whenReady().then(() => {
    configureDesktopPermissions();
    createWindow();
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
