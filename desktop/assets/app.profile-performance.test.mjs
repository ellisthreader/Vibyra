import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync(new URL("./app.shell.js", import.meta.url), "utf8");
const state = readFileSync(new URL("./app.profile-state.js", import.meta.url), "utf8");
const actions = readFileSync(new URL("./app.profile-actions.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("./app.profile.css", import.meta.url), "utf8");

test("desktop refresh does not rebuild an open settings modal", () => {
  assert.doesNotMatch(shell, /renderProfileModal\(\)/);
});

test("settings bindings stay scoped to the modal", () => {
  assert.match(actions, /function bindProfileControls\(root = profileRenderTarget\(\) \|\| document\)/);
  assert.match(actions, /root\.querySelectorAll\("\[data-profile-action\]"\)/);
});

test("non-visual preference saves avoid global theme mutation", () => {
  assert.match(state, /dataset\.desktopTheme !== appearance/);
  assert.match(state, /dataset\.chatFont !== chatFont/);
});

test("settings backdrop avoids live blur compositing", () => {
  assert.doesNotMatch(styles, /backdrop-filter/);
});
