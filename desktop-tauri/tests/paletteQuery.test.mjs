import assert from "node:assert/strict";
import test from "node:test";

import {
  PALETTE_SCOPES,
  paletteMatch,
  paletteScore,
  parsePaletteQuery,
} from "../src/lib/paletteQuery.ts";

test("a leading punctuation character picks a scope and leaves the rest", () => {
  assert.deepEqual(parsePaletteQuery("restart"), { scope: "all", text: "restart" });
  assert.deepEqual(parsePaletteQuery(">restart"), { scope: "command", text: "restart" });
  assert.deepEqual(parsePaletteQuery("@claude"), { scope: "session", text: "claude" });
  assert.deepEqual(parsePaletteQuery("#vibyra"), { scope: "project", text: "vibyra" });
  assert.deepEqual(parsePaletteQuery("! run the tests"), { scope: "ask", text: "run the tests" });
});

test("every advertised scope actually parses", () => {
  for (const { prefix, scope } of PALETTE_SCOPES) {
    assert.equal(parsePaletteQuery(`${prefix}x`).scope, scope);
  }
});

test("an empty query matches everything at zero rather than nothing", () => {
  const match = paletteMatch("Restart agent", "");
  assert.deepEqual(match, { score: 0, ranges: [] });
});

test("a whole-phrase hit always beats a scattered one", () => {
  const phrase = paletteMatch("Restart agent", "restart");
  const scattered = paletteMatch("Report a start", "restart");
  assert.ok(phrase && scattered, "both should match at all");
  assert.ok(phrase.score > scattered.score, `${phrase.score} vs ${scattered.score}`);
});

test("a hit at the start of a word beats the same hit buried mid-token", () => {
  const front = paletteMatch("Settings: Performance", "perf");
  const buried = paletteMatch("Hyperfine output", "perf");
  assert.ok(front && buried);
  assert.ok(front.score > buried.score, `${front.score} vs ${buried.score}`);
});

test("ranges point at the characters that matched, folded into runs", () => {
  assert.deepEqual(paletteMatch("Restart agent", "restart")?.ranges, [[0, 7]]);
  // r-e-s picked out of "Reset stage" is still one run, then a second.
  const spread = paletteMatch("New terminal", "ntl");
  assert.ok(spread);
  for (const [start, end] of spread.ranges) {
    assert.ok(end > start && end <= "New terminal".length);
  }
  assert.equal(
    spread.ranges.map(([s, e]) => "New terminal".slice(s, e)).join("").toLowerCase(),
    "ntl",
  );
});

test("a query the label cannot supply does not match", () => {
  assert.equal(paletteMatch("Restart agent", "zzz"), null);
  // Order matters: the characters are there, backwards.
  assert.equal(paletteMatch("abc", "cba"), null);
});

test("keywords reach an entry whose label shares no word with the query", () => {
  const hidden = paletteScore("Close terminal", "stop kill quit", "kill");
  assert.ok(hidden, "keywords should be searched");
  assert.deepEqual(hidden.ranges, [], "a keyword hit must not highlight the label");

  const visible = paletteScore("Kill terminal", "stop kill quit", "kill");
  assert.ok(visible);
  assert.ok(visible.score > hidden.score, "a label the user can see outranks a hidden word");
});

test("no keywords and no label hit is simply no result", () => {
  assert.equal(paletteScore("Close terminal", undefined, "kill"), null);
  assert.equal(paletteScore("Close terminal", "stop quit", "kill"), null);
});
