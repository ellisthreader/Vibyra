import assert from "node:assert/strict";
import test from "node:test";

import { formatCheckedAt, updateSummary } from "../src/lib/updateCheckPolicy.ts";
import { NO_PROGRESS } from "../src/lib/updatePolicy.ts";

const base = {
  status: "idle",
  checkState: "idle",
  version: "",
  progress: NO_PROGRESS,
  error: null,
  checkError: null,
};

const summary = (overrides) => updateSummary({ ...base, ...overrides });

test("a healthy check says so out loud instead of rendering nothing", () => {
  // The whole point of this pane: an app that is current must be visibly
  // distinguishable from one whose update check is quietly failing.
  const current = summary({ checkState: "done" });
  assert.equal(current.tone, "ok");
  assert.match(current.headline, /up to date/i);
  assert.equal(current.action.kind, "check");
  assert.equal(current.action.busy, false);
});

test("a failing feed surfaces here even though the banner stays silent", () => {
  const failed = summary({ checkState: "failed", checkError: "Error: network unreachable" });
  assert.equal(failed.tone, "error");
  assert.match(failed.headline, /couldn't check/i);
  assert.match(failed.detail, /network unreachable/);
  assert.equal(failed.action.kind, "check");
});

test("a failed check still offers a retry when the cause is unknown", () => {
  const failed = summary({ checkState: "failed" });
  assert.match(failed.detail, /could not be reached/i);
  assert.equal(failed.action.busy, false, "a retry the user cannot press is worse than none");
});

test("a check in flight disables its own button rather than queueing checks", () => {
  const checking = summary({ checkState: "checking" });
  assert.equal(checking.tone, "busy");
  assert.equal(checking.action.busy, true);
});

test("before the first check the pane explains the schedule rather than claiming health", () => {
  const fresh = summary({});
  assert.equal(fresh.tone, "neutral");
  assert.doesNotMatch(fresh.headline, /up to date/i);
  assert.match(fresh.detail, /20 minutes/);
  assert.equal(fresh.action.kind, "check");
});

test("a found release outranks the check that found it", () => {
  // `checkState` is "done" on the same tick a release is found; reporting
  // "up to date" there would contradict the banner on screen beside it.
  const available = summary({ status: "available", checkState: "done", version: "0.2.0" });
  assert.match(available.headline, /0\.2\.0 is available/);
  assert.equal(available.action.kind, "download");
});

test("download progress reads the same numbers the banner does", () => {
  const downloading = summary({
    status: "downloading",
    checkState: "done",
    version: "0.2.0",
    progress: { received: 5 * 1024 * 1024, total: 20 * 1024 * 1024, percent: 25 },
  });
  assert.equal(downloading.tone, "busy");
  assert.match(downloading.detail, /25% — 5\.0 MB of 20 MB/);
  assert.equal(downloading.action.busy, true);
});

test("an unmeasurable download does not invent a percentage", () => {
  const downloading = summary({
    status: "downloading",
    checkState: "done",
    version: "0.2.0",
    progress: NO_PROGRESS,
  });
  assert.doesNotMatch(downloading.detail, /%/);
});

test("a staged release asks for a restart, not another download", () => {
  const ready = summary({ status: "ready", checkState: "done", version: "0.2.0" });
  assert.equal(ready.action.kind, "restart");
  assert.match(ready.detail, /terminals will close/i);
});

test("a paused restart keeps its own error and offers the restart again", () => {
  const paused = summary({
    status: "restartError",
    checkState: "done",
    version: "0.2.0",
    error: "Error: could not flush scrollback",
  });
  assert.equal(paused.tone, "error");
  assert.match(paused.detail, /could not flush scrollback/);
  assert.equal(paused.action.kind, "restart");
});

test("a download failure retries the download rather than re-checking the feed", () => {
  const failed = summary({ status: "error", checkState: "done", version: "0.2.0", error: null });
  assert.equal(failed.action.kind, "download");
});

test("every state offers exactly one thing to press", () => {
  const states = [
    {},
    { checkState: "checking" },
    { checkState: "done" },
    { checkState: "failed" },
    { status: "available", version: "1.0.0" },
    { status: "downloading", version: "1.0.0" },
    { status: "ready", version: "1.0.0" },
    { status: "installing", version: "1.0.0" },
    { status: "error", version: "1.0.0" },
    { status: "restartError", version: "1.0.0" },
  ];
  for (const state of states) {
    const result = summary(state);
    assert.ok(result.action, `no action for ${JSON.stringify(state)}`);
    assert.ok(result.headline.length > 0);
    assert.ok(result.detail.length > 0);
  }
});

test("the last-checked line degrades from minutes to days", () => {
  const now = 1_700_000_000_000;
  const ago = (ms) => formatCheckedAt(now - ms, now);

  assert.match(formatCheckedAt(null, now), /No successful check yet/);
  assert.match(ago(30_000), /just now/);
  assert.match(ago(60_000), /1 minute ago/);
  assert.match(ago(5 * 60_000), /5 minutes ago/);
  assert.match(ago(60 * 60_000), /1 hour ago/);
  assert.match(ago(5 * 60 * 60_000), /5 hours ago/);
  assert.match(ago(48 * 60 * 60_000), /2 days ago/);
});

test("a clock that jumped backwards reads as just now, never as negative time", () => {
  const now = 1_700_000_000_000;
  assert.match(formatCheckedAt(now + 10_000, now), /just now/);
});
