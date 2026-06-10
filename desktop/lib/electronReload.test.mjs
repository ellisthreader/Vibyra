import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

const require = createRequire(import.meta.url);
const { watchDesktopMainSources } = require("./electronReload.cjs");
const mainSource = await readFile(new URL("../electron-main.cjs", import.meta.url), "utf8");
const reloadSource = await readFile(new URL("./electronReload.cjs", import.meta.url), "utf8");

test("a second desktop launch reloads the existing renderer without cache", () => {
  assert.match(reloadSource, /webContents\.reloadIgnoringCache\(\)/);
  assert.match(mainSource, /app\.on\("second-instance", \(\) => reloadDesktopWindow\(mainWindow\)\)/);
});

test("frameless desktop reload shortcuts bypass the renderer cache", () => {
  assert.match(reloadSource, /before-input-event/);
  assert.match(reloadSource, /key === "F5"/);
  assert.match(reloadSource, /input\.control \|\| input\.meta/);
  assert.match(reloadSource, /event\.preventDefault\(\)/);
});

test("desktop main source changes relaunch Electron instead of only reloading the renderer", async () => {
  const callbacks = [];
  const closed = [];
  const app = {
    exitCode: null,
    relaunched: false,
    exit(code) { this.exitCode = code; },
    relaunch() { this.relaunched = true; }
  };
  const stop = watchDesktopMainSources(app, ["main", "preload"], (path, options, callback) => {
    assert.deepEqual(options, { persistent: false });
    callbacks.push(callback);
    return { close: () => closed.push(path) };
  });

  callbacks[0]();
  callbacks[1]();
  await new Promise((resolve) => setTimeout(resolve, 150));
  stop();

  assert.equal(app.relaunched, true);
  assert.equal(app.exitCode, 0);
  assert.deepEqual(closed, ["main", "preload"]);
});
