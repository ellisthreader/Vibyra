import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync(new URL("./app.shell.js", import.meta.url), "utf8");
const state = readFileSync(new URL("./app.profile-state.js", import.meta.url), "utf8");
const actions = readFileSync(new URL("./app.profile-actions.js", import.meta.url), "utf8");
const performance = readFileSync(new URL("./app.profile-performance.js", import.meta.url), "utf8");
const render = readFileSync(new URL("./app.profile-render.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("./app.profile.css", import.meta.url), "utf8");

test("desktop refresh does not rebuild an open settings modal", () => {
  assert.doesNotMatch(shell, /renderProfileModal\(\)/);
});

test("settings bindings stay scoped to the modal", () => {
  assert.match(actions, /function bindProfileControls\(root = profileRenderTarget\(\) \|\| document\)/);
  assert.match(actions, /root\.addEventListener\("click", handleProfileClick\)/);
  assert.match(actions, /root\.dataset\.profileDelegated/);
});

test("settings section changes preserve the navigation rail", () => {
  assert.match(render, /const existingPage = options\.reset \? null : target\.querySelector\("\.profile-page--desktop"\)/);
  assert.match(render, /detail\.innerHTML = renderProfileDetail\(profileActiveSection, meta\)/);
  assert.match(render, /syncProfileSectionRail\(existingPage, sections\)/);
});

test("non-visual preference saves avoid global theme mutation", () => {
  assert.match(state, /dataset\.desktopTheme !== appearance/);
  assert.match(state, /dataset\.chatFont !== chatFont/);
});

test("appearance changes preserve mounted preview screenshots", () => {
  const appearanceBranch = performance.match(/if \(key === "appearance"\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  assert.match(appearanceBranch, /classList\.toggle\("active", active\)/);
  assert.match(appearanceBranch, /setAttribute\("aria-pressed", String\(active\)\)/);
  assert.doesNotMatch(appearanceBranch, /renderProfile\(/);
  assert.match(render, /<span class="profile-appearance-check" aria-hidden="true">/);
});

test("settings backdrop avoids live blur compositing", () => {
  assert.doesNotMatch(styles, /backdrop-filter/);
});

test("settings modal keeps a stable desktop height while changing sections", () => {
  assert.match(styles, /height: min\(860px, calc\(100vh - 56px\)\)/);
});
