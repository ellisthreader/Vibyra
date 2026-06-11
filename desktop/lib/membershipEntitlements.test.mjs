import assert from "node:assert/strict";
import test from "node:test";
import {
  maxActiveProjects,
  maxConcurrentAgents,
  maxConcurrentTerminalAgents
} from "./membershipEntitlements.mjs";

test("membership limits derive from the verified plan and fail closed for malformed accounts", () => {
  assert.equal(maxConcurrentAgents(null), 12);
  assert.equal(maxConcurrentAgents({}), 0);
  assert.equal(maxConcurrentAgents({ plan: "starter" }), 1);
  assert.equal(maxConcurrentAgents({ plan: "builder" }), 2);
  assert.equal(maxConcurrentAgents({ plan: "pro" }), 4);
  assert.equal(maxConcurrentAgents({ plan: "pro", maxConcurrentAgents: "2" }), 2);
  assert.equal(maxConcurrentAgents({ plan: "pro", maxConcurrentAgents: "invalid" }), 0);
  assert.equal(maxConcurrentTerminalAgents({ plan: "free" }), 1);
  assert.equal(maxConcurrentTerminalAgents({ plan: "builder" }), 2);

  assert.equal(maxActiveProjects({ plan: "free" }), 1);
  assert.equal(maxActiveProjects({ plan: "starter" }), 1);
  assert.equal(maxActiveProjects({ plan: "builder" }), 3);
  assert.equal(maxActiveProjects({ plan: "pro" }), 10);
});
