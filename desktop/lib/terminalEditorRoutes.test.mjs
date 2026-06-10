import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routes = readFileSync(new URL("./desktopRoutes.mjs", import.meta.url), "utf8");

test("nested desktop API paths cannot fall through to static files", () => {
  assert.match(routes, /url\.pathname\.match\(\/\^\\\/desktop\\\/\(\[\^\/\]\+\)\$\/\)/);
  assert.doesNotMatch(routes, /url\.pathname\.startsWith\("\\\/desktop\\\/"\)[\s\S]{0,180}sendFile/);
});

test("terminal editor routes run before the single-file desktop fallback", () => {
  assert.ok(routes.indexOf('url.pathname.startsWith("/desktop/terminal-editor/")')
    < routes.indexOf("const desktopFileRoute"));
});

test("Monaco is served from its dedicated local vendor directory", () => {
  assert.match(routes, /const monacoAssetsDir = join\([^;]+"monaco-editor", "min", "vs"\)/s);
  assert.match(routes, /url\.pathname\.startsWith\("\/desktop\/vendor\/monaco\/vs\/"\)/);
  assert.match(routes, /sendSafeAsset\(res, monacoAssetsDir/);
});
