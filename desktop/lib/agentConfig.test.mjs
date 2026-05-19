import test from "node:test";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { openRouterConfigPaths, parseEnvConfigValue } from "./agent.mjs";

test("OpenRouter config paths include repo env files when desktop is the cwd", () => {
  const repoRoot = resolve("/tmp/vibyra");
  const desktopCwd = join(repoRoot, "desktop");

  assert.deepEqual(openRouterConfigPaths(desktopCwd, repoRoot), [
    join(desktopCwd, "backend", ".env"),
    join(desktopCwd, ".env"),
    join(repoRoot, "backend", ".env"),
    join(repoRoot, ".env")
  ]);
});

test("OpenRouter config parser handles common dotenv syntax", () => {
  const body = [
    "APP_NAME=Vibyra",
    "export OPENROUTER_API_KEY = \"sk-test-value\"",
    "OPENROUTER_API_URL=https://openrouter.ai/api/v1/chat/completions # default"
  ].join("\n");

  assert.equal(parseEnvConfigValue(body, "OPENROUTER_API_KEY"), "sk-test-value");
  assert.equal(parseEnvConfigValue(body, "OPENROUTER_API_URL"), "https://openrouter.ai/api/v1/chat/completions");
});
