import test from "node:test";
import assert from "node:assert/strict";
import {
  formatElapsedDuration,
  renderProviderBrandLogo,
  renderTerminalMarkdown,
  taskCompletionText,
  taskProgressText
} from "./aiTerminalVibyraAgentPresentation.mjs";
import {
  providerInfoForModel,
  registeredProviderFamilies
} from "./aiTerminalVibyraAgentBranding.mjs";

test("every registered provider family has a structured non-fallback theme", () => {
  const families = registeredProviderFamilies();
  assert.ok(families.length >= 25);

  for (const family of families) {
    const info = providerInfoForModel(`${family}/example-model`);
    assert.equal(info.fallback, false, family);
    assert.equal(info.runtime, "vibyra-agent", family);
    assert.equal(info.officialCli, false, family);
    assert.equal(info.nativeUi, "", family);
    assert.equal(typeof info.theme.id, "string", family);
    assert.equal(typeof info.theme.dimension, "string", family);
    assert.equal(typeof info.theme.motion, "string", family);
    assert.equal(info.theme.logoId, family);
    assert.equal(typeof info.theme.prompt.glyph, "string", family);
    assert.equal(typeof info.theme.activity.verb, "string", family);
    assert.match(info.theme.status.working, /progress$/, family);
  }
});

test("registered provider logos are materially distinct asset-backed treatments", () => {
  const families = registeredProviderFamilies();
  const outputs = families.map((family) => renderProviderBrandLogo(
    providerInfoForModel(`${family}/example-model`),
    false
  ).join("\n"));
  const logoIds = families.map((family) => providerInfoForModel(`${family}/example-model`).theme.logoId);

  assert.equal(new Set(outputs).size, families.length);
  assert.equal(new Set(logoIds).size, families.length);
  for (const output of outputs) {
    assert.match(output, /[█▀▄]/);
    assert.ok(output.split("\n").length >= 18);
  }
});

test("provider logos support no-color output and bounded narrow widths", () => {
  const info = providerInfoForModel("nous-research/hermes-example");
  const plain = renderProviderBrandLogo(info, false, { maxWidth: 18 });
  const colored = renderProviderBrandLogo(info, true, { maxWidth: 18 });

  assert.equal(plain.some((line) => line.includes("\x1b[")), false);
  assert.ok(plain.every((line) => [...line].length <= 18));
  assert.ok(colored.every((line) => stripAnsi(line).length <= 18));
  assert.match(plain.join("\n"), /[█▀▄]/);
});

test("unknown providers receive an attractive deterministic fallback theme", () => {
  const first = providerInfoForModel("acme-labs/model-a");
  const second = providerInfoForModel("acme-labs/model-b");
  const other = providerInfoForModel("other-labs/model-a");

  assert.equal(first.fallback, true);
  assert.deepEqual(first.theme, second.theme);
  assert.equal(first.theme.logoId, "");
  assert.equal(other.theme.logoId, "");
  assert.equal(
    renderProviderBrandLogo(first, false).join("\n"),
    renderProviderBrandLogo(second, false).join("\n")
  );
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

function stripAnsi(value) {
  return String(value).replace(/\x1b\[[0-9;]*m/g, "");
}
