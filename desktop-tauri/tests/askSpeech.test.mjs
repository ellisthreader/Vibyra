import assert from "node:assert/strict";
import test from "node:test";

import { SPEAK_MAX_CHARS, speakableText } from "../src/lib/askSpeech.ts";

test("names a code block instead of reading it out", () => {
  const spoken = speakableText("Try this:\n```sh\nnpm run app:build\n```\nthen relaunch.");
  assert.equal(spoken.includes("npm run"), false);
  assert.match(spoken, /code block/);
  assert.match(spoken, /then relaunch\./);
});

test("an unterminated fence does not swallow the rest of the reply", () => {
  // A truncated reply can end mid-fence; a greedy match would eat the tail.
  const spoken = speakableText("Here:\n```\nnpm test");
  assert.match(spoken, /^Here:/);
  assert.equal(spoken.includes("npm test"), false);
});

test("drops markdown furniture but keeps every word", () => {
  const spoken = speakableText("## Status\n\n- **two** panes are `running`\n- see [the docs](http://x.dev)");
  assert.equal(spoken, "Status two panes are running see the docs");
});

test("keeps prose that merely contains asterisks or underscores", () => {
  assert.equal(speakableText("the file is a_b_c.txt"), "the file is a_b_c.txt");
  assert.equal(speakableText("2 * 3 is 6"), "2 * 3 is 6");
});

test("quotes and blank lines collapse to speakable spacing", () => {
  assert.equal(speakableText("> quoted\n\n\nnext"), "quoted next");
});

test("empty and whitespace-only replies produce nothing to speak", () => {
  assert.equal(speakableText(""), "");
  assert.equal(speakableText("   \n\n "), "");
  assert.equal(speakableText("```\n\n```"), "(code block)");
});

test("a long reply is cut at a sentence end, never mid-word", () => {
  const long = "All panes are healthy. ".repeat(200);
  const spoken = speakableText(long);
  assert.ok(spoken.length <= SPEAK_MAX_CHARS, `${spoken.length} chars`);
  assert.ok(spoken.endsWith("."), JSON.stringify(spoken.slice(-40)));
});

test("a long reply with no sentence end still stops on a word boundary", () => {
  const spoken = speakableText("word ".repeat(500));
  assert.ok(spoken.length <= SPEAK_MAX_CHARS);
  assert.ok(spoken.endsWith("word"), JSON.stringify(spoken.slice(-20)));
});
