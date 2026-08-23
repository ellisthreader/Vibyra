import assert from "node:assert/strict";
import test from "node:test";

import { runTerminalOperation } from "../src/state/terminalOperationGuard.ts";

test("a pane can only have one replacement launch in flight", async () => {
  let releases;
  let calls = 0;
  const waiting = new Promise((resolve) => {
    releases = resolve;
  });
  const first = runTerminalOperation(7, async () => {
    calls += 1;
    await waiting;
  });
  await runTerminalOperation(7, async () => {
    calls += 1;
  });
  assert.equal(calls, 1);
  releases();
  await first;
});

test("the guard releases a pane after failure", async () => {
  await assert.rejects(runTerminalOperation(9, async () => {
    throw new Error("launch failed");
  }));
  let retried = false;
  await runTerminalOperation(9, async () => {
    retried = true;
  });
  assert.equal(retried, true);
});
