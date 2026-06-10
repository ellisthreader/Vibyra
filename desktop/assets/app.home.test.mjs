import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../app.html", import.meta.url), "utf8");
const state = readFileSync(new URL("./app.state.js", import.meta.url), "utf8");
const pages = readFileSync(new URL("./app.pages.js", import.meta.url), "utf8");
const helpers = readFileSync(new URL("./app.render-helpers.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("./app.home.css", import.meta.url), "utf8");
const contentStyles = readFileSync(new URL("./app.home-content.css", import.meta.url), "utf8");
const ptyRuntime = readFileSync(new URL("./app.terminals-pty-runtime.js", import.meta.url), "utf8");

test("desktop navigation exposes Home without a Builds destination", () => {
  assert.match(state, /key: "dashboard", label: "Home", icon: "home"/);
  assert.doesNotMatch(state, /label: "Builds"/);
});

test("Home uses real terminal, phone, project, and activity state", () => {
  assert.match(pages, /homeTerminalRows\(\)/);
  assert.match(helpers, /currentState\.pairedDevice/);
  assert.match(helpers, /typeof terminals === "undefined"/);
  assert.match(helpers, /currentState\.projects/);
  assert.match(helpers, /currentState\.events/);
  assert.match(pages, /events\.length.*recent/);
  assert.match(pages, /workingTerminals.*homeTerminalIsWorking/);
  assert.match(pages, /working now/);
  assert.match(helpers, /terminal\.providerState === "busy"/);
  assert.doesNotMatch(helpers, /terminal\.lastWorkAt/);
  assert.doesNotMatch(ptyRuntime, /terminal\.lastWorkAt = Date\.now\(\)/);
  assert.match(ptyRuntime, /terminalProviderActivitySignal/);
  assert.match(ptyRuntime, /providerBusyObserved/);
  assert.doesNotMatch(pages, /Builds on this desktop/);
  assert.doesNotMatch(pages, /Usage this month/);
});

test("Home owns scoped late-loaded styles instead of Builds route overrides", () => {
  assert.match(html, /app\.home\.css/);
  assert.match(html, /app\.home-content\.css/);
  assert.match(html, /app\.home-responsive\.css/);
  assert.doesNotMatch(html, /app\.builds-screenshot/);
  assert.match(styles, /\.desktop-home/);
  assert.match(contentStyles, /\.desktop-home-terminal-row/);
  assert.match(contentStyles, /desktop-home-working-pulse/);
  assert.doesNotMatch(styles, /(^|[\s,{])\.home-page([\s,{]|$)/m);
  assert.doesNotMatch(styles, /body:has/);
});
