import assert from "node:assert/strict";
import test from "node:test";

import { previewNotification } from "../src/lib/previewNotifications.ts";

function status(phase, over = {}) {
  return { phase, targetId: "web", url: null, command: null, logs: [], error: null, ...over };
}

test("a preview coming up is announced, but never on the desktop", () => {
  // You are looking at the preview pane when this happens.
  const notice = previewNotification(status("starting"), status("running", { url: "http://localhost:5173" }));
  assert.equal(notice.severity, "info");
  assert.equal(notice.body, "http://localhost:5173");
  assert.equal(notice.osEligible, false);
});

test("a crash is sticky and carries the reason", () => {
  const notice = previewNotification(status("running"), status("failed", { error: "port in use" }));
  assert.equal(notice.severity, "danger");
  assert.equal(notice.body, "port in use");
  assert.equal(notice.timeoutMs, 0);
});

test("without an error the last log line explains it", () => {
  const notice = previewNotification(status("running"), status("failed", { logs: ["a", "exit 1"] }));
  assert.equal(notice.body, "exit 1");
});

test("a repeated poll of the same phase says nothing", () => {
  assert.equal(previewNotification(status("running"), status("running")), null);
});

test("a preview that never started is not a crash", () => {
  assert.equal(previewNotification(status("idle"), status("failed")), null);
  assert.equal(previewNotification(undefined, status("failed")), null);
});

test("stopping a preview on purpose is not news", () => {
  assert.equal(previewNotification(status("running"), status("stopped")), null);
});
