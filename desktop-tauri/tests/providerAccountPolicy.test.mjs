import test from "node:test";
import assert from "node:assert/strict";

import {
  accountWorking,
  connectedAccounts,
  enabledRuntimesForAccounts,
  isAccountRuntime,
  providerIconKey,
  providerAccountRuntimeUpdate,
  providerStatusLabel,
  providerWorking,
} from "../src/lib/providerAccountPolicy.ts";

function account(status, accountId = "default") {
  return {
    accountId,
    status,
    accountLabel: "",
    detail: "",
    signInPageAvailable: false,
    prompt: "",
    removable: accountId !== "default",
  };
}

/** One company holding whichever accounts the test cares about. */
function provider(id, ...statuses) {
  return {
    id,
    company: id,
    product: id,
    runtimeId: id,
    installed: true,
    package: `@${id}/cli`,
    accounts: statuses.map((status, index) =>
      account(status, index === 0 ? "default" : `extra-${index}`),
    ),
    canAddAccount: true,
  };
}

// A runtime whose company is signed in keeps the position it already had;
// only the ones with nothing signed in are dropped. Gemini goes because no
// Google account is connected, and codex stays where the user left it.
test("connected company accounts own their native runtime selection", () => {
  const result = enabledRuntimesForAccounts(
    ["codex", "qwen", "gemini"],
    [provider("codex", "connected"), provider("claude", "sign-in-required")],
  );
  assert.deepEqual(result, ["codex", "qwen"]);
});

// The point of the whole feature: a company with two logins, one of them
// signed out, is still a company you are signed in to.
test("one signed-in account is enough to keep a runtime available", () => {
  const codex = provider("codex", "sign-in-required", "connected");
  assert.deepEqual(enabledRuntimesForAccounts([], [codex]), ["codex"]);
  assert.equal(connectedAccounts(codex).length, 1);
  assert.equal(connectedAccounts(codex)[0].accountId, "extra-1");
});

test("a company with every account signed out drops its runtime", () => {
  const codex = provider("codex", "sign-in-required", "sign-in-required");
  assert.deepEqual(enabledRuntimesForAccounts(["codex"], [codex]), []);
});

test("provider presentation stays company scoped", () => {
  assert.equal(providerIconKey(provider("codex", "connected")), "openai");
  assert.equal(providerStatusLabel(account("connecting")), "Authorizing");
  assert.equal(isAccountRuntime("claude"), true);
  assert.equal(isAccountRuntime("qwen"), false);
});

test("startup account discovery updates only changed connected runtimes", () => {
  const connected = [provider("codex", "connected")];
  assert.deepEqual(providerAccountRuntimeUpdate([], connected, true, ""), ["codex"]);
  assert.equal(providerAccountRuntimeUpdate(["codex"], connected, true, ""), null);
  assert.equal(providerAccountRuntimeUpdate([], connected, false, ""), null);
  assert.equal(providerAccountRuntimeUpdate([], connected, true, "lookup failed"), null);
});

test("transient account states do not disable a previously selected runtime", () => {
  const providers = [provider("codex", "error"), provider("gemini", "connecting")];
  assert.deepEqual(
    enabledRuntimesForAccounts(["codex", "qwen", "gemini"], providers),
    ["codex", "qwen", "gemini"],
  );
});

test("an install in flight is transient, not a reason to deselect a runtime", () => {
  assert.deepEqual(
    enabledRuntimesForAccounts(["claude"], [provider("claude", "installing")]),
    ["claude"],
  );
});

// The pane polls only while something it started is still running, and the
// reply box only ever appears off the back of one of those polls.
test("both kinds of child process count as work in progress", () => {
  assert.equal(accountWorking(account("connecting")), true);
  assert.equal(accountWorking(account("installing")), true);
  assert.equal(accountWorking(account("not-installed")), false);
  assert.equal(accountWorking(account("error")), false);
  assert.equal(providerStatusLabel(account("installing")), "Installing");
  // One busy account makes the whole card busy: that is what drives the poll.
  assert.equal(providerWorking(provider("claude", "sign-in-required", "connecting")), true);
  assert.equal(providerWorking(provider("claude", "connected")), false);
});
