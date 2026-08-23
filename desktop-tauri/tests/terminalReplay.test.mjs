import assert from "node:assert/strict";
import test from "node:test";

import { mergeReplaySnapshots } from "../src/lib/terminalReplay.ts";

test("an account switch retains restored history and current PTY output", () => {
  assert.equal(
    mergeReplaySnapshots("restored\r\n── resumed ──\r\n", "new output"),
    "restored\r\n── resumed ──\r\nnew output",
  );
  assert.equal(mergeReplaySnapshots("restored", null), "restored");
  assert.equal(mergeReplaySnapshots(null, "current"), "current");
  assert.equal(mergeReplaySnapshots(null, null), null);
});
