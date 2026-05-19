const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");

app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");

const port = process.env.VIBYRA_AGENT_PORT || "4317";
const appUrl = process.env.VIBYRA_DESKTOP_URL || `http://127.0.0.1:${port}/desktop`;
let mainWindow;

function createWindow() {
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

  mainWindow.loadURL(appUrl);
  mainWindow.once("ready-to-show", () => mainWindow?.show());
}

app.whenReady().then(createWindow);

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
  mainWindow?.close();
});
