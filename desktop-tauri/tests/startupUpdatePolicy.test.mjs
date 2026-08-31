import assert from "node:assert/strict";
import test from "node:test";

import { startupUpdateCopy } from "../src/lib/startupUpdatePolicy.ts";
import { NO_PROGRESS } from "../src/lib/updatePolicy.ts";

const copy = (phase, options = {}) => startupUpdateCopy(
  phase,
  options.version ?? "",
  options.progress ?? NO_PROGRESS,
  options.error ?? null,
);

test("checking is calm and honestly indeterminate", () => {
  const checking = copy("checking");
  assert.match(checking.title, /checking for updates/i);
  assert.equal(checking.progressMode, "indeterminate");
  assert.equal(checking.progressValue, null);
});

test("a current build briefly confirms that startup can continue", () => {
  const current = copy("current");
  assert.match(current.title, /ready/i);
  assert.match(current.detail, /opening/i);
  assert.equal(current.progressValue, 100);
});

test("known download size reports bounded, accessible progress", () => {
  const downloading = copy("downloading", {
    version: "0.3.0",
    progress: { received: 25, total: 100, percent: 25.4 },
  });
  assert.match(downloading.title, /Vibyra 0\.3\.0/);
  assert.equal(downloading.progressMode, "determinate");
  assert.equal(downloading.progressValue, 25);
  assert.match(downloading.detail, /25%/);

  const overflow = copy("downloading", {
    progress: { received: 120, total: 100, percent: 120 },
  });
  assert.equal(overflow.progressValue, 100);
});

test("unknown download size never invents a percentage", () => {
  const downloading = copy("downloading", { version: "0.3.0" });
  assert.equal(downloading.progressMode, "indeterminate");
  assert.equal(downloading.progressValue, null);
  assert.doesNotMatch(downloading.detail, /%/);
});

test("installing promises only the automatic restart", () => {
  const installing = copy("installing", { version: "0.3.0" });
  assert.match(installing.title, /installing Vibyra 0\.3\.0/i);
  assert.match(installing.detail, /restart automatically/i);
  assert.equal(installing.progressMode, "indeterminate");
});

test("check failure gives a useful offline fallback", () => {
  const failed = copy("failed");
  assert.match(failed.title, /couldn’t check/i);
  assert.match(failed.detail, /connection/i);
  assert.equal(failed.progressMode, "hidden");
});

test("update-stage failure reassures without claiming success", () => {
  const failed = copy("failed", { version: "0.3.0" });
  assert.match(failed.title, /couldn’t be completed/i);
  assert.match(failed.detail, /current version is still safe/i);
  assert.doesNotMatch(failed.title, /installed|ready/i);
});

test("a concrete failure reason is preserved", () => {
  const failed = copy("failed", {
    version: "0.3.0",
    error: "Signature verification failed",
  });
  assert.equal(failed.detail, "Signature verification failed");
});
