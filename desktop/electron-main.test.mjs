import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./electron-main.cjs", import.meta.url), "utf8");
const launcherSource = readFileSync(new URL("../Vibyra Desktop", import.meta.url), "utf8");
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
  assert.match(source, /ipcMain\.handle\("screenshot:reset-directory"/);
  assert.doesNotMatch(source, /ipcMain\.handle\("screenshot:recent"/);
  assert.match(source, /ipcMain\.handle\("screenshot:reveal"/);
  assert.match(source, /target\.startsWith\(`\$\{directory\}\$\{path\.sep\}`\)/);
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

test("Electron accepts desktop shell URLs with or without a trailing slash", () => {
  assert.match(source, /const normalizedPath = \(value\) => value\.replace\(\/\\\/\+\$\/, ""\) \|\| "\/"/);
  assert.match(source, /normalizedPath\(loaded\.pathname\) === normalizedPath\(expected\.pathname\)/);
});
