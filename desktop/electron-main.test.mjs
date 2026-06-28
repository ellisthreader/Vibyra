import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./electron-main.cjs", import.meta.url), "utf8");
const preloadSource = readFileSync(new URL("./electron-preload.cjs", import.meta.url), "utf8");
const launcherSource = readFileSync(new URL("../Vibyra Desktop", import.meta.url), "utf8");
const desktopEntrySource = readFileSync(new URL("../Vibyra Desktop.desktop", import.meta.url), "utf8");
const installerSource = readFileSync(new URL("../scripts/install-desktop-launcher.sh", import.meta.url), "utf8");
const windowSource = readFileSync(new URL("./lib/window.mjs", import.meta.url), "utf8");

test("Electron uses the Vibyra runtime name and native app icon", () => {
  assert.match(source, /const APP_NAME = "Vibyra"/);
  assert.match(source, /const APP_ICON_PATH = path\.join\(__dirname, "vibyra-login-logo\.png"\)/);
  assert.match(source, /const LINUX_DESKTOP_NAME = "vibyra\.desktop"/);
  assert.match(source, /app\.setName\(APP_NAME\)/);
  assert.match(source, /app\.setDesktopName\(LINUX_DESKTOP_NAME\)/);
  assert.match(source, /app\.setAppUserModelId\("app\.vibyra\.desktop"\)/);
  assert.match(source, /icon: APP_ICON_PATH/);
  assert.match(source, /title: APP_NAME/);
  assert.match(source, /app\.dock\.setIcon\(APP_ICON_PATH\)/);
  assert.match(launcherSource, /--class=vibyra/);
  assert.match(windowSource, /"--class=vibyra"/);
});

test("Electron denies blank child windows and opens web links externally", () => {
  assert.match(source, /setWindowOpenHandler/);
  assert.match(source, /url === "about:blank".*action: "deny"/s);
  assert.match(source, /shell\.openExternal\(url\)/);
  assert.match(source, /\/\^\(https\?:\|mailto:\)\/i/);
  assert.match(source, /url\.startsWith\("blob:"\).*action: "allow"/s);
});

test("Electron registers the F9 screenshot editor bridge and cleans it up", () => {
  assert.match(source, /createDesktopScreenshot/);
  assert.match(source, /registerF9Shortcut\(captureScreenshotForEditor\)/);
  assert.match(source, /unregisterF9Shortcut\(\)/);
  assert.match(source, /"screenshot:captured"/);
  assert.match(source, /screenshotCapturePending \|\| screenshotEditorOpen/);
  assert.match(source, /ipcMain\.on\("screenshot:editor-state"/);
  assert.match(source, /ipcMain\.handle\("screenshot:copy"/);
  assert.match(source, /ipcMain\.handle\("screenshot:copy-saved"/);
  assert.match(source, /ipcMain\.handle\("screenshot:save"/);
  assert.match(source, /createDesktopScreenshotSettings/);
  assert.match(source, /ipcMain\.handle\("screenshot:settings"/);
  assert.match(source, /ipcMain\.handle\("screenshot:choose-directory"/);
  assert.match(source, /ipcMain\.handle\("projects:pick"/);
  assert.match(source, /ipcMain\.handle\("screenshot:reset-directory"/);
  assert.doesNotMatch(source, /ipcMain\.handle\("screenshot:recent"/);
  assert.match(source, /ipcMain\.handle\("screenshot:reveal"/);
  assert.match(source, /target\.startsWith\(`\$\{directory\}\$\{path\.sep\}`\)/);
});

test("Electron exposes a narrow text clipboard bridge for terminal selection copy", () => {
  assert.match(preloadSource, /vibyraDesktopClipboard/);
  assert.match(preloadSource, /clipboard:write-text/);
  assert.match(source, /ipcMain\.handle\("clipboard:write-text"/);
  assert.match(source, /event\.sender !== mainWindow\.webContents/);
  assert.match(source, /clipboard\.writeText\(String\(text \|\| ""\)\)/);
});

test("Electron real quit stops the detached desktop bridge before exiting", () => {
  assert.match(source, /function stopDesktopBridge\(\)/);
  assert.match(source, /\/desktop\/quit/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /timeout: 1500/);
  assert.match(source, /app\.on\("before-quit", \(event\)/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /bridgeShutdownComplete = true;\s+app\.quit\(\)/s);
});

test("Windows helper processes are hidden behind the desktop window", () => {
  assert.match(source, /windowsHide: true/);
  assert.match(windowSource, /electron\.exe/);
  assert.match(windowSource, /windowsHide: true/);
});

test("Electron accepts desktop shell URLs with or without a trailing slash", () => {
  assert.match(source, /const normalizedPath = \(value\) => value\.replace\(\/\\\/\+\$\/, ""\) \|\| "\/"/);
  assert.match(source, /normalizedPath\(loaded\.pathname\) === normalizedPath\(expected\.pathname\)/);
});

test("Linux launcher is app-style and self-prepares the desktop runtime", () => {
  assert.match(launcherSource, /ensure_node_dependencies\(\)/);
  assert.match(launcherSource, /ensure_local_backend\(\)/);
  assert.match(launcherSource, /ELECTRON_LOG_DIR="\$LAUNCHER_LOG_DIR"/);
  assert.match(launcherSource, /ELECTRON_LOG="\$ELECTRON_LOG_DIR\/electron\.log"/);
  assert.match(launcherSource, /npm install --no-audit --no-fund/);
  assert.match(launcherSource, /VIBYRA_DESKTOP_API_URL/);
  assert.match(launcherSource, /Vibyra Desktop dependencies/);
  assert.match(installerSource, /DESKTOP_FILE="\$APPLICATIONS_DIR\/vibyra\.desktop"/);
  assert.match(installerSource, /DESKTOP_SHORTCUT="\$DESKTOP_SHORTCUT_DIR\/Vibyra\.desktop"/);
  assert.match(installerSource, /StartupWMClass=vibyra/);
  assert.match(installerSource, /Icon=\$ICON_NAME/);
  assert.match(desktopEntrySource, /Name=Vibyra/);
  assert.match(desktopEntrySource, /StartupWMClass=vibyra/);
  assert.doesNotMatch(desktopEntrySource, /\/home\/taylor/);
});
