import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const { userFacingAgentError } = await loadAgentErrors();

test("chat error copy hides raw transport and provider failures", () => {
  const cases = [
    ["HTTP 401 Unauthorized", /OpenRouter key is missing or invalid/i],
    ["502 Bad Gateway", /AI service failed/i],
    ["Failed to fetch", /could not reach Vibyra/i]
  ];

  for (const [raw, expected] of cases) {
    const message = userFacingAgentError(new Error(raw));
    assert.match(message, expected);
    assert.doesNotMatch(message, /HTTP 401|502 Bad Gateway|Failed to fetch/);
  }
});

async function loadAgentErrors() {
  const source = await readFile(new URL("./agentErrors.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  const require = (id) => {
    if (id === "./chatUsageLimit") {
      return {
        setChatUsageLimitFromError: () => null,
        usageLimitMessage: () => "usage limit"
      };
    }
    throw new Error(`Unexpected import ${id}`);
  };
  new Function("exports", "module", "require", output)(module.exports, module, require);
  return module.exports;
}
