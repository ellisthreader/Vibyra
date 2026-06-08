import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  appState,
  desktopRuntimeState,
  requestRendererProtocolReload,
  TERMINAL_ACTION_PROTOCOL_VERSION
} from "./state.mjs";

const mainSource = await readFile(new URL("../electron-main.cjs", import.meta.url), "utf8");
const bootSource = await readFile(new URL("../assets/app.boot.js", import.meta.url), "utf8");
const htmlSource = await readFile(new URL("../app.html", import.meta.url), "utf8");

test("runtime exposes the terminal action protocol and coalesces stale renderer reloads", () => {
  appState.rendererReloadRequest = null;
  const first = requestRendererProtocolReload("stale-renderer");
  const second = requestRendererProtocolReload("stale-renderer");

  assert.equal(first.terminalActionProtocolVersion, TERMINAL_ACTION_PROTOCOL_VERSION);
  assert.ok(first.rendererReloadRequestId);
  assert.equal(second.rendererReloadRequestId, first.rendererReloadRequestId);
  assert.equal(
    desktopRuntimeState(TERMINAL_ACTION_PROTOCOL_VERSION).rendererReloadRequestId,
    null
  );
});

test("renderer blocks actions until the bridge protocol matches", () => {
  assert.match(bootSource, /terminalActionProtocolReady = false/);
  assert.match(bootSource, /window\.runDesktopActions = async/);
  assert.match(bootSource, /No terminal action ran/);
  assert.match(bootSource, /terminalActionProtocolReady = true/);
  assert.match(bootSource, /\/desktop\/runtime\/renderer-mismatch/);
  assert.match(htmlSource, /app\.boot\.js\?v=terminal-action-protocol-20260608/);
});

test("Electron consumes each bridge reload request once and bypasses cache", () => {
  assert.match(mainSource, /\/desktop\/runtime/);
  assert.match(mainSource, /handledRendererReloadRequestId/);
  assert.match(mainSource, /observedTerminalActionProtocolVersion/);
  assert.match(mainSource, /protocolChanged \|\| reloadRequested/);
  assert.match(mainSource, /reloadDesktopWindow\(mainWindow\)/);
});
