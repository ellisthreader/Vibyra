import assert from "node:assert/strict";
import test from "node:test";

import { startAppRuntime } from "../src/lib/appStartup.ts";

test("starts model and agent discovery without waiting for workspace setup", async () => {
  const started = [];
  let finishWorkspace;
  const workspace = new Promise((resolve) => {
    finishWorkspace = resolve;
  });

  startAppRuntime(
    {
      initializeWorkspace: () => {
        started.push("workspace");
        return workspace;
      },
      refreshAgents: async () => {
        started.push("agents");
      },
      refreshModels: async () => {
        started.push("models");
      },
    },
    () => {},
  );

  assert.deepEqual(started, ["agents", "models", "workspace"]);
  finishWorkspace();
  await workspace;
});

test("isolates startup failures by task", async () => {
  const failures = [];
  startAppRuntime(
    {
      initializeWorkspace: async () => {},
      refreshAgents: async () => {
        throw new Error("agent lookup failed");
      },
      refreshModels: async () => {},
    },
    (scope) => failures.push(scope),
  );

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(failures, ["agents"]);
});
