import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../app.html", import.meta.url), "utf8");
const state = readFileSync(new URL("./app.state.js", import.meta.url), "utf8");
const pages = readFileSync(new URL("./app.pages.js", import.meta.url), "utf8");
const helpers = readFileSync(new URL("./app.render-helpers.js", import.meta.url), "utf8");
const shell = readFileSync(new URL("./app.shell.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("./app.home.css", import.meta.url), "utf8");
const launchStyles = readFileSync(new URL("./app.home-launch.css", import.meta.url), "utf8");
const contentStyles = readFileSync(new URL("./app.home-content.css", import.meta.url), "utf8");
const rowStyles = readFileSync(new URL("./app.home-rows.css", import.meta.url), "utf8");
const ptyRuntime = readFileSync(new URL("./app.terminals-pty-runtime.js", import.meta.url), "utf8");

test("desktop navigation exposes Home without a Builds destination", () => {
  assert.match(state, /key: "dashboard", label: "Home", icon: "home"/);
  assert.doesNotMatch(state, /label: "Builds"/);
});

test("Home uses real terminal, phone, and project state", () => {
  assert.match(pages, /homeTerminalRows\(\)/);
  assert.match(helpers, /currentState\.pairedDevice/);
  assert.match(helpers, /typeof terminals === "undefined"/);
  assert.match(helpers, /currentState\.projects/);
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

test("Home is a borderless editorial surface instead of a card dashboard", () => {
  assert.match(pages, /desktop-home-hero/);
  assert.doesNotMatch(pages, /Build what's next\./);
  assert.doesNotMatch(pages, /desktop-home-hero-brand/);
  assert.doesNotMatch(pages, /desktop-home-header/);
  assert.doesNotMatch(pages, /Desktop ready/);
  assert.match(pages, /Ask Vibyra anything/);
  assert.match(pages, /desktop-home-context/);
  assert.match(pages, /homeProjectRow/);
  assert.match(pages, /desktop-home-recent/);
  assert.doesNotMatch(pages, /desktop-home-launch/);
  assert.doesNotMatch(pages, /desktop-home-status/);
  assert.doesNotMatch(pages, /desktop-home-workbench/);
  assert.doesNotMatch(pages, /Recent activity/);
  assert.doesNotMatch(pages, /desktop-home-card/);
  assert.doesNotMatch(pages, /homePhonePanel/);
  assert.doesNotMatch(styles, /\.desktop-home-card/);
  assert.match(launchStyles, /grid-template-columns: repeat\(3/);
  assert.match(styles, /--home-command-bg: #19191d/);
  assert.match(launchStyles, /var\(--home-command-bg\)/);
  assert.match(launchStyles, /border-radius: 9px/);
  assert.doesNotMatch(launchStyles, /radial-gradient/);
  assert.doesNotMatch(launchStyles, /translateY/);
});

test("Home welcomes newly created accounts once and returning accounts back", () => {
  assert.match(pages, /vibyra\.desktop\.firstWelcomeUserId/);
  assert.match(pages, /Welcome to Vibyra, \$\{firstName\}\./);
  assert.match(pages, /Welcome back, \$\{firstName\}\./);
});

test("Home owns scoped late-loaded styles instead of Builds route overrides", () => {
  assert.match(html, /app\.home\.css/);
  assert.match(html, /app\.home-launch\.css/);
  assert.match(html, /app\.home-content\.css/);
  assert.match(html, /app\.home-rows\.css/);
  assert.match(html, /app\.home-responsive\.css/);
  assert.doesNotMatch(html, /app\.builds-screenshot/);
  assert.match(shell, /desktop-home-active/);
  assert.match(shell, /content home-content/);
  assert.match(styles, /\.desktop-home/);
  assert.match(contentStyles, /\.desktop-home-recent-grid/);
  assert.match(rowStyles, /\.desktop-home-terminal-row/);
  assert.match(rowStyles, /desktop-home-working-pulse/);
  assert.doesNotMatch(styles, /(^|[\s,{])\.home-page([\s,{]|$)/m);
  assert.doesNotMatch(styles, /body:has/);
});
