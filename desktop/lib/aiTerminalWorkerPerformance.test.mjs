import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./aiTerminalWorker.mjs", import.meta.url), "utf8");
const processSource = readFileSync(new URL("./aiTerminalProcess.mjs", import.meta.url), "utf8");

test("terminal worker keeps synchronous filesystem writes off echoed keystrokes", () => {
  const start = source.indexOf("function handleOutput");
  const end = source.indexOf("\nfunction handleExit", start);
  const handleOutput = source.slice(start, end);

  assert.match(handleOutput, /queueOutputWrite\(value\)/);
  assert.match(handleOutput, /scheduleStateWrite\(\)/);
  assert.doesNotMatch(handleOutput, /appendFileSync|writeFileSync|statSync/);
  assert.match(source, /setTimeout\(flushOutputWrites,\s*24\)/);
});

test("detached workers renew scoped gateway tokens while the terminal is alive", () => {
  assert.match(source, /renewTerminalGatewayToken\(value\)/);
  assert.match(source, /6 \* 60 \* 60 \* 1000/);
  assert.match(source, /clearInterval\(gatewayRenewalTimer\)/);
});

test("provider spawn does not synchronously execute a version probe", () => {
  const start = processSource.indexOf("export function spawnAiTerminalProcess");
  const end = processSource.indexOf("\nfunction assertLaunchPlanMatchesAgent", start);
  const spawnSource = processSource.slice(start, end);

  assert.doesNotMatch(spawnSource, /aiTerminalProviderVersion|execFileSync/);
});
