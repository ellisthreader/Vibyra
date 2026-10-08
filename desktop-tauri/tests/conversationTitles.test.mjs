import assert from "node:assert/strict";
import test from "node:test";

import { conversationTitle, conversationsToName, withTitles } from "../src/lib/conversationTitlePlan.ts";

const session = (id, extra = {}) => ({ id, projectId: "p", title: "GPT-6 Astra", status: "exited", kind: "codex", accountId: "default", ...extra });

test("a conversation is named after its first real request, not a greeting or its model", () => {
  assert.equal(conversationTitle({ nativeTitle: null, requests: ["hoe are u oing boss", "yeah go through the whole code base and see what needs doing please! then assign roles"] }), "Code base");
  assert.equal(conversationTitle({ nativeTitle: null, requests: ["hi", "thanks"] }), null);
  assert.equal(conversationTitle({ nativeTitle: "pricing-page-redesign", requests: ["fix the login bug"] }), "Pricing page redesign");
  assert.equal(conversationTitle({ nativeTitle: null, requests: ["fix the login bug, it loops"] }), "Fix the login bug");
  assert.equal(conversationTitle({ nativeTitle: null, requests: ["review frontend and launch 5 subagetns"] }), "Review frontend");
  assert.equal(conversationTitle({ nativeTitle: null, requests: ["Vibyra's website journey from landing page → sign up"] }), "Vibyra's website journey from landing page");
  assert.equal(conversationTitle({ nativeTitle: null, requests: ["fix src/components/"] }), "Fix src/components");
});

test("names replace the launch title only where one exists, keeping unchanged sessions identical", () => {
  const sessions = [session("a"), session("b")];
  const named = withTitles(sessions, { a: "Code base" });
  assert.equal(named[0].title, "Code base");
  assert.equal(named[1], sessions[1]);
});

test("saved conversations are asked about once; running and open ones keep being checked", () => {
  const sessions = [session("saved"), session("live", { status: "running" }), session("open"), session("shell", { kind: "shell" })];
  const tried = new Set();
  assert.deepEqual(conversationsToName(sessions, {}, "all", ["open"], tried).map(s => s.id), ["saved", "live", "open"]);
  tried.add("saved");
  assert.deepEqual(conversationsToName(sessions, { open: "X" }, "all", ["open"], tried).map(s => s.id), ["live", "open"]);
  assert.deepEqual(conversationsToName(sessions, {}, "unnamed", [], tried).map(s => s.id), ["live"]);
  assert.deepEqual(conversationsToName(sessions, { live: "Named" }, "unnamed", [], tried).map(s => s.id), []);
});
