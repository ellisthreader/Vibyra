import assert from "node:assert/strict";
import test from "node:test";

import { parseAnswer } from "../src/lib/agentMarkdown.ts";
import { parseInline } from "../src/lib/agentMarkdownInline.ts";

const kinds = (blocks) => blocks.map((block) => block.kind);
const text = (spans) => spans.map((span) => span.text).join("");

test("an unterminated fence is still a fence", () => {
  // The rule the whole parser is shaped around. Answers are parsed while they
  // stream, so the closing ``` has not arrived for most of a code block's
  // life. Treating that as literal backticks makes the block snap from prose
  // to code when the model finishes typing, which reads as the app glitching.
  const blocks = parseAnswer("Here:\n\n```rust\nfn main() {");
  assert.deepEqual(kinds(blocks), ["paragraph", "code"]);
  assert.equal(blocks[1].language, "rust");
  assert.equal(blocks[1].text, "fn main() {");
  assert.equal(blocks[1].open, true);
});

test("a closed fence is closed, and keeps its own blank lines", () => {
  const blocks = parseAnswer("```js\nconst a = 1;\n\nconst b = 2;\n```\nafter");
  assert.deepEqual(kinds(blocks), ["code", "paragraph"]);
  assert.equal(blocks[0].open, false);
  assert.equal(blocks[0].text, "const a = 1;\n\nconst b = 2;");
});

test("markdown inside a fence stays literal", () => {
  // Everything between the fences is source, including things that would
  // otherwise be headings and list markers.
  const blocks = parseAnswer("```\n# not a heading\n- not a list\n```");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].text, "# not a heading\n- not a list");
});

test("headings, lists and rules are recognised", () => {
  const blocks = parseAnswer("## What I found\n\n- one\n- two\n\n---\n\n1. first\n2. second");
  assert.deepEqual(kinds(blocks), ["heading", "list", "rule", "list"]);
  assert.equal(blocks[0].level, 3);
  assert.equal(blocks[1].ordered, false);
  assert.equal(blocks[1].items.length, 2);
  assert.equal(blocks[3].ordered, true);
  assert.equal(text(blocks[3].items[1]), "second");
});

test("a list broken by a paragraph does not swallow it", () => {
  const blocks = parseAnswer("- one\n\nbetween\n\n- two");
  assert.deepEqual(kinds(blocks), ["list", "paragraph", "list"]);
  assert.equal(blocks[0].items.length, 1);
  assert.equal(blocks[2].items.length, 1);
});

test("inline code wins over every other marker inside it", () => {
  // `**` inside backticks is a literal pair of asterisks, which matters the
  // first time a model explains a glob or a pointer type.
  const spans = parseInline("use `a**b` not **a**");
  assert.deepEqual(
    spans.map((span) => [span.kind, span.text]),
    [
      ["text", "use "],
      ["code", "a**b"],
      ["text", " not "],
      ["strong", "a"],
    ],
  );
});

test("only http and https survive as links", () => {
  const safe = parseInline("[docs](https://example.com/a)");
  assert.deepEqual(safe, [{ kind: "link", text: "docs", href: "https://example.com/a" }]);

  // The one genuinely dangerous thing a model can put in a transcript that
  // renders inside the app's own webview.
  const unsafe = parseInline("[click](javascript:alert(1))");
  assert.deepEqual(unsafe, [{ kind: "text", text: "[click](javascript:alert(1))" }]);
});

test("unbalanced markers mid-stream stay as text", () => {
  // A model produces these constantly while streaming; swallowing them would
  // make text flicker between styles as it arrives.
  assert.deepEqual(parseInline("half **bold"), [{ kind: "text", text: "half **bold" }]);
  assert.deepEqual(parseInline("2 * 3 * 4"), [{ kind: "text", text: "2 * 3 * 4" }]);
});

test("an empty answer produces no blocks", () => {
  assert.deepEqual(parseAnswer(""), []);
  assert.deepEqual(parseAnswer("\n\n  \n"), []);
});
