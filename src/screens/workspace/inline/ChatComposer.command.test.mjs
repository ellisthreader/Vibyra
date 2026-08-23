import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./useChatComposerController.ts", import.meta.url), "utf8");
const facade = await readFile(new URL("./ChatComposer.tsx", import.meta.url), "utf8");
const toolPlan = await readFile(new URL("./useChatToolPlan.ts", import.meta.url), "utf8");

test("ChatComposer keeps its public facade and focused ownership boundaries", () => {
  assert.match(facade, /export function ChatComposer\(props: ChatComposerProps\)/);
  assert.match(facade, /useChatComposerController\(props\)/);
  assert.match(facade, /<ChatComposerView controller=\{controller\} props=\{props\} \/>/);
});

test("/open with args routes through normal folder-search chat path", () => {
  assert.match(source, /props\.onStart\(\{ displayPrompt: userText, prompt: `open folder \$\{args\.trim\(\)\}` \}\)/);
});

test("/open without args opens picker without clearing composer first", () => {
  const openBlock = source.match(/if \(command\.kind === "open"\) \{[\s\S]*?\n    \}/)?.[0] ?? "";
  assert.match(openBlock, /props\.onOpenFolderCommand\(\)/);
  assert.match(openBlock, /props\.onStart[\s\S]*return;\n      \}\n      props\.onOpenFolderCommand\(\)/);
});

test("tool plan cancellation and unmount retain request invalidation guards", () => {
  assert.match(toolPlan, /planRequestIdRef\.current \+= 1/);
  assert.match(toolPlan, /startingToolPlanRef\.current = false/);
  assert.match(toolPlan, /options\.onPreviewChange\?\.\(null\)/);
});
