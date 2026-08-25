import assert from "node:assert/strict";
import test from "node:test";

import { timeoutFor } from "../src/lib/notificationTiers.ts";
import { updateNotification, updateSignature } from "../src/lib/updateNotifications.ts";

const NO_PROGRESS = { received: 0, total: 0, percent: 0 };

function state(overrides = {}) {
  return {
    status: "available",
    version: "0.2.1",
    progress: NO_PROGRESS,
    error: null,
    notes: "",
    ...overrides,
  };
}

test("nothing to say while the updater is idle", () => {
  assert.equal(updateNotification(state({ status: "idle" })), null);
  // A status without a version is a half-populated store, never a release.
  assert.equal(updateNotification(state({ version: "" })), null);
});

test("an available release is news, not a warning", () => {
  const notice = updateNotification(state());
  assert.equal(notice.kind, "update");
  assert.equal(notice.tier, "news");
  assert.equal(notice.pinned, true);
  assert.equal(notice.action.id, "downloadUpdate");
});

test("a download is busy, carries its percentage, and never reaches the desktop", () => {
  const notice = updateNotification(
    state({ status: "downloading", progress: { received: 21, total: 42, percent: 50 } }),
  );
  assert.equal(notice.tier, "busy");
  assert.equal(notice.progress, 50);
  assert.equal(notice.osEligible, false);
  // Work in progress ends when the work does, not on a clock.
  assert.equal(timeoutFor(notice.tier), 0);
});

test("a length-less download draws the indeterminate bar rather than nought percent", () => {
  const notice = updateNotification(
    state({ status: "downloading", progress: { received: 900, total: 0, percent: 0 } }),
  );
  assert.equal(notice.tier, "busy");
  assert.equal(notice.progress, undefined);
});

test("ready to restart is the ask tier, and it cannot time out", () => {
  const notice = updateNotification(state({ status: "ready" }));
  assert.equal(notice.tier, "ask");
  assert.equal(notice.pinned, true);
  assert.equal(notice.action.id, "restartForUpdate");
  // Restarting under a running agent loses work, so this only ever happens on
  // an explicit choice — a notice that expired would take that choice away.
  assert.equal(timeoutFor(notice.tier), 0);
});

test("both failures are the fail tier, and neither takes the banner slot", () => {
  for (const status of ["error", "restartError"]) {
    const notice = updateNotification(state({ status, error: "network unreachable" }));
    assert.equal(notice.tier, "fail", status);
    assert.equal(notice.pinned, false, `${status} must stay dismissible`);
    assert.equal(timeoutFor(notice.tier), 0, status);
  }
});

test("every state replaces the last, so one download is one card", () => {
  const keys = ["available", "downloading", "ready", "error"].map(
    (status) => updateNotification(state({ status })).replaceKey,
  );
  assert.deepEqual(new Set(keys), new Set(["update"]));
});

test("a busy card offers no button while the work it would start is in flight", () => {
  // `bannerCopy` marks these busy; a "Download" button during a download is a
  // second way to start the thing already running.
  assert.equal(updateNotification(state({ status: "downloading" })).action, undefined);
  assert.equal(updateNotification(state({ status: "installing" })).action, undefined);
});

test("the signature changes on whole percents, not on every chunk", () => {
  const at = (percent) =>
    updateSignature(state({ status: "downloading", progress: { received: 0, total: 42, percent } }));
  assert.equal(at(12), at(12), "the same percent is the same card");
  assert.notEqual(at(12), at(13));
  // A new state is always worth saying, even at the same percentage.
  assert.notEqual(at(100), updateSignature(state({ status: "ready" })));
  // And a changed error re-announces rather than being swallowed as a repeat.
  assert.notEqual(
    updateSignature(state({ status: "error", error: "one" })),
    updateSignature(state({ status: "error", error: "two" })),
  );
});
