import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
