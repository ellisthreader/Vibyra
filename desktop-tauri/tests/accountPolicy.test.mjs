import assert from "node:assert/strict";
import test from "node:test";

import {
  avatarInitial,
  canEditEmail,
  logoutConfirmCopy,
  oauthProgressCopy,
  validateEmailAuth,
  validateProfileEdit,
} from "../src/lib/accountPolicy.ts";

const profile = (overrides = {}) => ({
  name: "Ada Lovelace",
  email: "ada@vibyra.app",
  provider: "email",
  plan: "free",
  emailVerified: true,
  ...overrides,
});

test("avatar initial prefers the name and falls back to email", () => {
  assert.equal(avatarInitial(profile()), "A");
  assert.equal(avatarInitial(profile({ name: "" })), "A");
  assert.equal(avatarInitial(profile({ name: "", email: "zoe@x.dev" })), "Z");
  assert.equal(avatarInitial(null), "•");
  assert.equal(avatarInitial(profile({ name: "émile", email: "" })), "•");
});

test("email edits are reserved for email-provider accounts", () => {
  assert.equal(canEditEmail(profile()), true);
  assert.equal(canEditEmail(profile({ provider: "google" })), false);
  assert.equal(canEditEmail(profile({ provider: "apple" })), false);
  assert.equal(canEditEmail(null), true);
});

test("email auth validation mirrors the backend rules", () => {
  const ok = { name: "Ada", email: "ada@vibyra.app", password: "longenough" };
  assert.equal(validateEmailAuth("signup", ok), null);
  assert.equal(validateEmailAuth("login", { ...ok, name: "" }), null);
  assert.equal(validateEmailAuth("signup", { ...ok, name: " " }), "Enter your name.");
  assert.match(validateEmailAuth("login", { ...ok, email: "nope" }), /valid email/);
  assert.match(validateEmailAuth("login", { ...ok, password: "short" }), /eight characters/);
});

test("profile edit validation requires name and valid email", () => {
  assert.equal(validateProfileEdit({ name: "Ada", email: "ada@vibyra.app" }), null);
  assert.match(validateProfileEdit({ name: " ", email: "ada@vibyra.app" }), /display name/);
  assert.match(validateProfileEdit({ name: "Ada", email: "bad" }), /valid email/);
});

test("oauth progress copy names the provider honestly", () => {
  assert.equal(oauthProgressCopy("google"), "Finish signing in with Google in your browser.");
  assert.equal(oauthProgressCopy("apple"), "Finish signing in with Apple in your browser.");
});

test("logout confirmation appears only when terminals are running", () => {
  assert.equal(logoutConfirmCopy(0), null);
  assert.match(logoutConfirmCopy(1), /1 running terminal /);
  assert.match(logoutConfirmCopy(3), /3 running terminals/);
});
