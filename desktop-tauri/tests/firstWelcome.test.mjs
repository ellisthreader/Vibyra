import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FIRST_WELCOME_STORAGE_KEY,
  WELCOME_DURATIONS,
  firstWelcomeBeats,
  hasSeenFirstWelcome,
  rememberFirstWelcome,
  welcomeFirstName,
} from "../src/lib/firstWelcomePolicy.ts";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
}

const profile = (welcomeKey, name = "Ada Lovelace") => ({
  name, email: "ada@vibyra.app", provider: "email", plan: "free",
  emailVerified: true, welcomeKey,
});

test("the installed five-chapter welcome uses its measured playback durations", () => {
  assert.deepEqual(WELCOME_DURATIONS, [2_000, 8_200, 8_200, 13_000, 1_500]);
  assert.equal(welcomeFirstName("  Ada Lovelace "), "Ada");
  assert.equal(welcomeFirstName(""), "there");
  const beats = firstWelcomeBeats("Ada Lovelace");
  assert.deepEqual(beats.map(({ label }) => label), ["Welcome", "Code", "Agents", "iPhone & Remote", "Start"]);
  assert.equal(beats[0].title, "Welcome to Vibyra, Ada.");
  assert.match(beats[1].body, /coding agents side by side/);
  assert.match(beats[2].body, /focused job/);
  assert.match(beats[3].body, /iPhone/);
  assert.equal(beats.at(-1).title, "Let’s build.");
});

test("completion is persisted once per opaque account key", () => {
  const storage = new MemoryStorage();
  const ada = profile("vw_policy_ada");
  const grace = profile("vw_policy_grace", "Grace Hopper");
  assert.equal(hasSeenFirstWelcome(ada, storage), false);
  rememberFirstWelcome(ada, storage);
  assert.equal(hasSeenFirstWelcome(ada, storage), true);
  assert.equal(hasSeenFirstWelcome(grace, storage), false);
  assert.deepEqual(JSON.parse(storage.getItem(FIRST_WELCOME_STORAGE_KEY)), ["vw_policy_ada"]);
});

test("malformed storage recovers and the history remains bounded", () => {
  const storage = new MemoryStorage();
  storage.setItem(FIRST_WELCOME_STORAGE_KEY, "not json");
  const current = profile("vw_policy_current");
  assert.equal(hasSeenFirstWelcome(current, storage), false);
  storage.setItem(
    FIRST_WELCOME_STORAGE_KEY,
    JSON.stringify(Array.from({ length: 55 }, (_, index) => `vw_old_${index}`)),
  );
  rememberFirstWelcome(current, storage);
  const saved = JSON.parse(storage.getItem(FIRST_WELCOME_STORAGE_KEY));
  assert.equal(saved.length, 50);
  assert.equal(saved.at(-1), "vw_policy_current");
});

test("the installed welcome is accessible, skippable, and honors reduced motion", () => {
  const component = readFileSync(new URL("../src/components/auth/FirstWelcome.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../src/components/layout/WorkspaceApp.tsx", import.meta.url), "utf8");
  const base = readFileSync(new URL("../src/styles/first-welcome.css", import.meta.url), "utf8");
  const motion = readFileSync(new URL("../src/styles/first-welcome-motion.css", import.meta.url), "utf8");
  assert.match(component, /role="dialog" aria-modal="true"/);
  assert.match(component, /useModalFocus\(dialogRef, true, closeFromEscape\)/);
  assert.match(component, /rememberFirstWelcome\(profile\)/);
  assert.match(component, /Skip intro/);
  assert.match(component, /aria-label="Introduction chapters"/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /player\.reduced/);
  assert.ok(workspace.indexOf("<FirstWelcome") > workspace.indexOf("<ProjectWorkspace"));
  assert.match(workspace, /data-welcome-focus/);
  assert.match(base, /\.first-welcome__chapters/);
  assert.match(motion, /@media \(prefers-reduced-motion:reduce\)/);
});
