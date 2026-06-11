import assert from "node:assert/strict";
import test from "node:test";

import { portLooksFree, reservePreviewPort } from "./previewPortAllocator.mjs";

test("concurrent preview port reservations never return the same port", async () => {
  const profile = { defaultPorts: [5173, 5174, 5175] };
  const [first, second] = await Promise.all([
    reservePreviewPort("", profile),
    reservePreviewPort("", profile)
  ]);
  try {
    assert.notEqual(first.port, second.port);
    assert.equal(await portLooksFree(first.port), true);
    assert.equal(await portLooksFree(second.port), true);
  } finally {
    first.release();
    second.release();
  }
  assert.equal(await portLooksFree(first.port), true);
});

test("preview port reservations honor exclusions", async () => {
  const first = await reservePreviewPort("", { defaultPorts: [8000, 8001] });
  const second = await reservePreviewPort("", { defaultPorts: [8000, 8001] }, { exclude: [first.port] });
  try {
    assert.notEqual(first.port, second.port);
  } finally {
    first.release();
    second.release();
  }
});
