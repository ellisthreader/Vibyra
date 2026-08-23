import assert from "node:assert/strict";
import test from "node:test";

import { nativeTerminalVisibility } from "../src/lib/terminalVisibility.ts";

test("off-screen terminals stop native delivery until their resync", () => {
  assert.equal(nativeTerminalVisibility("visible"), "visible");
  assert.equal(nativeTerminalVisibility("hidden"), "hibernated");
  assert.equal(nativeTerminalVisibility("hibernated"), "hibernated");
});
