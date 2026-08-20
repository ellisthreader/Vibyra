import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FIRST_WELCOME_BEAT_MS,
  FIRST_WELCOME_DURATION_MS,
  FIRST_WELCOME_STORAGE_KEY,
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
  name,
  email: "ada@vibyra.app",
  provider: "email",
  plan: "free",
  emailVerified: true,
  welcomeKey,
});

test("welcome copy is personal and completes four measured beats in 6.4 seconds", () => {
  assert.equal(FIRST_WELCOME_BEAT_MS, 1_600);
  assert.equal(FIRST_WELCOME_DURATION_MS, 6_400);
  assert.equal(welcomeFirstName("  Ada Lovelace "), "Ada");
  assert.equal(welcomeFirstName(""), "there");
  const beats = firstWelcomeBeats("Ada Lovelace");
  assert.equal(beats.length, 4);
  assert.equal(beats[0].title, "Welcome to Vibyra, Ada.");
  assert.match(beats[1].title, /Choose the work/);
  assert.match(beats[2].title, /coordinated team/);
  assert.match(beats[3].title, /Review anywhere/);
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

test("cinematic mounts over the workspace with accessible escape and reduced motion", () => {
  const component = readFileSync(
    new URL("../src/components/auth/FirstWelcome.tsx", import.meta.url),
    "utf8",
  );
  const workspace = readFileSync(
    new URL("../src/components/layout/WorkspaceApp.tsx", import.meta.url),
    "utf8",
  );
  const baseStyles = readFileSync(
    new URL("../src/styles/first-welcome.css", import.meta.url),
    "utf8",
  );
  const motion = readFileSync(
    new URL("../src/styles/first-welcome-motion.css", import.meta.url),
    "utf8",
  );
  assert.match(component, /role="dialog"/);
  assert.match(component, /useModalFocus\(dialogRef, true, closeFromEscape\)/);
  assert.match(component, /rememberFirstWelcome\(profile\)/);
  assert.match(component, /Start building/);
  assert.match(component, /Skip intro/);
  assert.match(component, /prefers-reduced-motion: reduce/);
  assert.ok(workspace.indexOf("<FirstWelcome") > workspace.indexOf("<ProjectWorkspace"));
  assert.match(workspace, /data-welcome-focus/);
  assert.match(baseStyles, /background: #0e0f12/);
  assert.match(motion, /firstWelcomeProgress 6\.4s/);
  assert.match(motion, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(`${component}\n${baseStyles}\n${motion}`, /carousel|fake log|backdrop-filter|infinite|#7b2cff|#ff35c8/i);
});
