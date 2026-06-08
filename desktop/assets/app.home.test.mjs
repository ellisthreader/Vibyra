import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../app.html", import.meta.url), "utf8");
const state = readFileSync(new URL("./app.state.js", import.meta.url), "utf8");
const pages = readFileSync(new URL("./app.pages.js", import.meta.url), "utf8");
const helpers = readFileSync(new URL("./app.render-helpers.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("./app.home.css", import.meta.url), "utf8");

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
  assert.doesNotMatch(pages, /Builds on this desktop/);
});

test("Home owns scoped late-loaded styles instead of Builds route overrides", () => {
  assert.match(html, /app\.home\.css/);
  assert.doesNotMatch(html, /app\.builds-screenshot/);
  assert.match(styles, /\.home-page/);
  assert.doesNotMatch(styles, /body:has/);
});
