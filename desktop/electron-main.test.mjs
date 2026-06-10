import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./electron-main.cjs", import.meta.url), "utf8");

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
  assert.match(source, /ipcMain\.handle\("screenshot:copy"/);
  assert.match(source, /ipcMain\.handle\("screenshot:save"/);
});
