import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const state = readFileSync(new URL("./app.profile-state.js", import.meta.url), "utf8");
const sections = readFileSync(new URL("./app.settings-sections.js", import.meta.url), "utf8");
const actions = readFileSync(new URL("./app.settings-actions.js", import.meta.url), "utf8");
const profileActions = readFileSync(new URL("./app.profile-actions.js", import.meta.url), "utf8");
const layout = readFileSync(new URL("./app.profile.css", import.meta.url), "utf8");
const markup = readFileSync(new URL("../app.html", import.meta.url), "utf8");

test("settings uses six clear sections without a label-only search", () => {
  for (const key of ["profile", "personalization", "app", "devices", "billing", "help"]) {
    assert.match(state, new RegExp(`key: "${key}"`));
  }
  assert.doesNotMatch(sections, /profile-section-search|profile-section-empty/);
  assert.doesNotMatch(state, /Improve Vibyra|Desktop app lock|profileLanguages|profileFaqs/);
});

test("cloud profile and local personalization save independently", () => {
  assert.match(profileActions, /async function saveDesktopProfile/);
  assert.doesNotMatch(profileActions, /saveProfilePreferencesFromForm/);
  assert.match(actions, /function saveDesktopPersonalization/);
  assert.match(actions, /saveDesktopPreferences\(prefs\)/);
});

test("destructive settings actions use inline confirmation instead of native confirm", () => {
  assert.match(actions, /renderSettingsConfirmation/);
  assert.match(sections, /data-profile-action="logout-all"/);
  assert.doesNotMatch(`${actions}\n${profileActions}`, /window\.confirm/);
});

test("narrow settings uses a horizontal sticky section strip", () => {
  assert.match(layout, /@media \(max-width: 720px\)/);
  assert.match(layout, /\.profile-modal-body \.profile-section-rail[\s\S]*position: sticky/);
  assert.match(layout, /\.profile-modal-body \.profile-section-list[\s\S]*overflow-x: auto/);
});

test("settings modules load in dependency order with semantic stylesheet names", () => {
  const stateIndex = markup.indexOf("app.profile-state.js");
  const actionIndex = markup.indexOf("app.settings-actions.js");
  const sectionIndex = markup.indexOf("app.settings-sections.js");
  const renderIndex = markup.indexOf("app.profile-render.js");
  assert.ok(stateIndex < actionIndex && actionIndex < sectionIndex && sectionIndex < renderIndex);
  assert.match(markup, /app\.settings-layout\.css/);
  assert.match(markup, /app\.settings-content\.css/);
  assert.match(markup, /app\.settings-fields\.css/);
  assert.doesNotMatch(markup, /app\.profile\.[123]\.css/);
});
