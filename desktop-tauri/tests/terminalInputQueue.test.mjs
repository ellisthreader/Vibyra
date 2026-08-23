import assert from "node:assert/strict";
import test from "node:test";

import { createTerminalInputQueue } from "../src/lib/terminalInputQueue.ts";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("terminal input stays ordered and coalesces behind an in-flight write", async () => {
  const writes = [];
  const gates = [];
  let active = 0;
  let peakActive = 0;
  const write = createTerminalInputQueue(async (id, data) => {
    const gate = deferred();
    writes.push({ id, data });
    gates.push(gate);
    active += 1;
    peakActive = Math.max(peakActive, active);
    await gate.promise;
    active -= 1;
  });

  const first = write(7, "a");
  const second = write(7, "b");
  const third = write(7, "c");
  assert.deepEqual(writes, [{ id: 7, data: "a" }]);

  gates[0].resolve();
  await first;
  assert.deepEqual(writes, [
    { id: 7, data: "a" },
    { id: 7, data: "bc" },
  ]);

  gates[1].resolve();
  await Promise.all([second, third]);
  assert.equal(peakActive, 1, "writes for one PTY must never overlap");
  assert.equal(writes.map(({ data }) => data).join(""), "abc");
});

test("different terminals do not block each other", async () => {
  const writes = [];
  const gates = new Map();
  const write = createTerminalInputQueue(async (id, data) => {
    const gate = deferred();
    writes.push({ id, data });
    gates.set(id, gate);
    await gate.promise;
  });

  const left = write(1, "left");
  const right = write(2, "right");
  assert.deepEqual(writes, [
    { id: 1, data: "left" },
    { id: 2, data: "right" },
  ]);

  gates.get(1).resolve();
  gates.get(2).resolve();
  await Promise.all([left, right]);
});

test("a failed write does not poison later input", async () => {
  const writes = [];
  let attempt = 0;
  const write = createTerminalInputQueue(async (_id, data) => {
    writes.push(data);
    attempt += 1;
    if (attempt === 1) throw new Error("temporary IPC failure");
  });

  await assert.rejects(write(3, "a"), /temporary IPC failure/);
  await write(3, "b");
  assert.deepEqual(writes, ["a", "b"]);
});
