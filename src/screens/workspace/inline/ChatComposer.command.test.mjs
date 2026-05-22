import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatComposer.tsx", import.meta.url), "utf8");

test("/open with args routes through normal folder-search chat path", () => {
  assert.match(source, /props\.onStart\(\{ displayPrompt: userText, prompt: `open folder \$\{args\.trim\(\)\}` \}\)/);
});

test("/open without args opens picker without clearing composer first", () => {
  const openBlock = source.match(/if \(command\.kind === "open"\) \{[\s\S]*?\n    \}/)?.[0] ?? "";
  assert.match(openBlock, /props\.onOpenFolderCommand\(\)/);
  assert.match(openBlock, /props\.onStart[\s\S]*return;\n      \}\n      props\.onOpenFolderCommand\(\)/);
});
