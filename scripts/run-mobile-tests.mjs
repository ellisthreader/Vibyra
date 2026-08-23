import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

function collectTests(directory, tests = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectTests(path, tests);
    else if (entry.name.endsWith(".test.mjs")) tests.push(path);
  }
  return tests;
}

const tests = collectTests("src").sort();
if (tests.length === 0) {
  console.error("No mobile tests found under src.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...tests], {
  stdio: "inherit"
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
