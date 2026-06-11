import test from "node:test";
import assert from "node:assert/strict";
import {
  formatElapsedDuration,
  renderProviderBrandLogo,
  renderTerminalMarkdown,
  taskCompletionText,
  taskProgressText
} from "./aiTerminalVibyraAgentPresentation.mjs";

test("provider logos use recognizable raised brand wordmarks", () => {
  const deepseek = renderProviderBrandLogo({
    provider: "deepseek",
    prompt: "deepseek",
    mark: "DS",
    name: "DeepSeek",
    color: "38;2;78;134;255"
  }, false).join("\n");
  const meta = renderProviderBrandLogo({
    provider: "meta-llama",
    prompt: "meta",
    mark: "ME",
    name: "Meta",
    color: "38;2;77;145;255"
  }, false).join("\n");

  assert.match(deepseek, /◒  DEEPSEEK/);
  assert.match(deepseek, /[▓▀]/);
  assert.match(meta, /∞  META/);
});

test("assistant Markdown gains terminal styling and clickable hyperlinks", () => {
  const styled = renderTerminalMarkdown(
    "## Result\n**Done** in `app.js`. Read [docs](https://example.com/docs).",
    true
  );
  const plain = renderTerminalMarkdown(
    "## Result\n**Done** in `app.js`. Read [docs](https://example.com/docs).",
    false
  );

  assert.match(styled, /\x1b\[1;38;2;236;230;255mResult/);
  assert.match(styled, /\x1b\[1mDone/);
  assert.match(styled, /\x1b\]8;;https:\/\/example\.com\/docs\x07/);
  assert.equal(plain, "Result\r\nDone in app.js. Read docs (https://example.com/docs).");
});

test("elapsed work copy switches cleanly from seconds to minutes", () => {
  assert.equal(formatElapsedDuration(9_999), "9s");
  assert.equal(formatElapsedDuration(125_000), "2m 05s");
  assert.equal(taskProgressText("DeepSeek", 125_000), "DeepSeek is still working · 2m 05s");
  assert.equal(taskCompletionText(125_000), "Worked for 2m 05s");
});
