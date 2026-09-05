import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("./latestPersistenceTask.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { createLatestPersistenceTask, invalidatePendingPersistence } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

test("snapshots normalize once and flush the most recent state", () => {
  const task = createLatestPersistenceTask(1000);
  const saved = [];
  for (let i = 0; i < 100; i++) task.schedule(() => saved.push(i));
  assert.deepEqual(saved, []);
  task.flush();
  task.flush();
  assert.deepEqual(saved, [99]);
});

test("identity cancellation cannot replay a stale authenticated save", () => {
  const task = createLatestPersistenceTask(1000);
  const saved = [];
  task.schedule(() => saved.push("old identity"));
  task.cancel();
  task.schedule(() => saved.push("logged out"));
  task.flush();
  assert.deepEqual(saved, ["logged out"]);
});

test("credential clearing invalidates delayed saves before a React render", () => {
  const task = createLatestPersistenceTask(1000);
  const saved = [];
  task.schedule(() => saved.push("old credentials"));
  invalidatePendingPersistence();
  task.flush();
  task.schedule(() => saved.push("new credentials"));
  task.flush();
  assert.deepEqual(saved, ["new credentials"]);
});

test("continuous changes do not indefinitely postpone the scheduled write", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const task = createLatestPersistenceTask(200);
  const saved = [];
  task.schedule(() => saved.push(1));
  t.mock.timers.tick(150);
  task.schedule(() => saved.push(2));
  t.mock.timers.tick(50);
  assert.deepEqual(saved, [2]);
});
