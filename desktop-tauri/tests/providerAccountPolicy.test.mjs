import test from "node:test";
import assert from "node:assert/strict";

import {
  enabledRuntimesForAccounts,
  isAccountRuntime,
  providerIconKey,
  providerAccountRuntimeUpdate,
  providerStatusLabel,
} from "../src/lib/providerAccountPolicy.ts";

function account(id, status, runtimeId = id) {
  return {
    id,
    company: id,
    product: id,
    runtimeId,
    installed: true,
    status,
    accountLabel: "",
    detail: "",
  };
}

test("connected company accounts own their native runtime selection", () => {
  const result = enabledRuntimesForAccounts(
    ["codex", "qwen", "gemini"],
    [account("codex", "connected"), account("claude", "sign-in-required")],
  );
  assert.deepEqual(result, ["qwen", "codex"]);
});

test("provider presentation stays company scoped", () => {
  assert.equal(providerIconKey(account("codex", "connected")), "openai");
  assert.equal(providerStatusLabel(account("gemini", "connecting")), "Authorizing");
  assert.equal(isAccountRuntime("claude"), true);
  assert.equal(isAccountRuntime("qwen"), false);
});

test("startup account discovery updates only changed connected runtimes", () => {
  const connected = [account("codex", "connected")];
  assert.deepEqual(providerAccountRuntimeUpdate([], connected, true, ""), ["codex"]);
  assert.equal(providerAccountRuntimeUpdate(["codex"], connected, true, ""), null);
  assert.equal(providerAccountRuntimeUpdate([], connected, false, ""), null);
  assert.equal(providerAccountRuntimeUpdate([], connected, true, "lookup failed"), null);
});

test("transient account states do not disable a previously selected runtime", () => {
  const accounts = [account("codex", "error"), account("gemini", "connecting")];
  assert.deepEqual(
    enabledRuntimesForAccounts(["codex", "qwen", "gemini"], accounts),
    ["codex", "qwen", "gemini"],
  );
});
