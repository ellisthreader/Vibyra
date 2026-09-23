import assert from "node:assert/strict";
import test from "node:test";

import { parseMarkdownDocument, plainText } from "../src/lib/markdownDocument.ts";
import { columnWidths } from "../src/lib/markdownTable.ts";

const first = (markdown, options) => parseMarkdownDocument(markdown, options).blocks[0];

const REPLY = [
  "# Release notes",
  "",
  "Vibyra Desktop **streams** its replies now, and the panel renders them",
  "as blocks rather than as one wall of text.",
  "",
  "## What changed",
  "",
  "- Markdown is parsed once, in `markdownDocument.ts`",
  "  - tables come from the shared mobile helper",
  "    - escaped pipes stay inside their cell",
  "- [x] soft breaks survive",
  "- [ ] the renderer lands next",
  "",
  "1. Parse the reply",
  "2. Render the blocks",
  "",
  "| Surface | Status | Owner |",
  "|:--|:-:|--:|",
  "| Desktop | shipping | ellis |",
  "| Mobile | shared | ellis |",
  "",
  "> Streaming is only pleasant while nothing jumps.",
  "",
  "It is _fast_, not ~~slow~~, and `parseMarkdownDocument` proves it.",
  "",
  "```bash",
  "npm test | tail -20",
  "```",
  "",
  "---",
  "",
  "## What changed",
  "",
  "| Only | Two |",
  "|---|---|",
  "| a | b |",
  "",
  "Check `npm test` and ~~never~~ the bare suite:",
  "",
  "~~~",
  "a tilde fence with no language",
  "~~~",
  "",
  "See [the plan](https://example.com/plan) for the rest.",
  "",
].join("\n");

test("a table keeps escaped pipes in their cell and fits every row to the header", () => {
  const table = first("| a \\| b | c | d |\n|:--|:-:|--:|\n| 1 | 2 | 3 | 4 |\n| x |\n");
  assert.equal(table.kind, "table");
  assert.deepEqual(table.headers, ["a | b", "c", "d"]);
  assert.deepEqual(table.alignments, ["left", "center", "right"]);
  assert.deepEqual(table.rows, [["1", "2", "3"], ["x", "", ""]]);
});

test("a pipe table inside a fence stays code, and an open fence says it is open", () => {
  const doc = parseMarkdownDocument("```bash\n| a | b |\n|---|---|\n```\nafter\n");
  assert.deepEqual(doc.blocks[0], { kind: "code", language: "bash", text: "| a | b |\n|---|---|", closed: true });
  assert.deepEqual(doc.blocks[1], { kind: "paragraph", text: "after" });
  const open = first("~~~~ts\nconst a = 1;", { streaming: true });
  assert.deepEqual(open, { kind: "code", language: "ts", text: "const a = 1;", closed: false });
});

test("list items carry their nesting and their task state", () => {
  const list = first("- top\n  - middle\n    - deep\n- [x] done\n- [ ] todo\n");
  assert.deepEqual(list.items.map((item) => item.depth), [0, 1, 2, 0, 0]);
  assert.deepEqual(list.items[0], { text: "top", depth: 0 });
  assert.deepEqual(list.items[3], { text: "done", depth: 0, checked: true });
  assert.deepEqual(list.items[4], { text: "todo", depth: 0, checked: false });
  assert.equal(parseMarkdownDocument("- one\n1. two\n").blocks.length, 2);
});

test("a wrapped paragraph keeps the soft break the model wrote", () => {
  assert.deepEqual(first("a\nb\n"), { kind: "paragraph", text: "a\nb" });
});

test("heading ids stay slugged and deduped", () => {
  const doc = parseMarkdownDocument("# Project\n\n## Rules\n\n## Rules\n");
  assert.deepEqual(doc.headings.map((heading) => heading.id), ["project", "rules", "rules-2"]);
});

test("a half-written row and an unfinished delimiter never reach a table", () => {
  const source = "| a | b |\n|---|---|\n| 1 | 2 |\n| 3";
  const streamed = parseMarkdownDocument(source, { streaming: true });
  assert.deepEqual(streamed.blocks[0].rows, [["1", "2"]]);
  assert.equal(streamed.blocks.length, 1);
  assert.deepEqual(parseMarkdownDocument(source).blocks[0].rows, [["1", "2"], ["3", ""]]);
  assert.equal(first("| a | b |\n|---|---|", { streaming: true }).kind, "paragraph");
});

test("a run whose closer has not arrived is held back, with the text inside it", () => {
  assert.equal(first("Vibyra is **render", { streaming: true }).text, "Vibyra is");
  assert.equal(first("it is _fas", { streaming: true }).text, "it is");
  assert.equal(first("not ~~slo", { streaming: true }).text, "not");
  assert.equal(first("run `npm tes", { streaming: true }).text, "run");
  assert.equal(first("hello **", { streaming: true }).text, "hello");
  assert.equal(first("see [the pla", { streaming: true }).text, "see");
  assert.equal(first("- keep `ls", { streaming: true }).items[0].text, "keep");
  assert.equal(first("> quote **half", { streaming: true }).text, "quote");
  assert.equal(first("tell me ~", { streaming: true }).text, "tell me");
  assert.equal(first("run ``", { streaming: true }).text, "run");
});

test("a fence closing one delta at a time is held back from the code body", () => {
  const open = first("```bash\nnpm test\n`", { streaming: true });
  assert.deepEqual(open, { kind: "code", language: "bash", text: "npm test", closed: false });
  assert.equal(first("```bash\nnpm test\n``", { streaming: true }).text, "npm test");
  assert.deepEqual(first("```bash\nnpm test\n```", { streaming: true }),
    { kind: "code", language: "bash", text: "npm test", closed: true });
  // Only the line still being written is withheld, and only its own fence character.
  assert.equal(first("```bash\nnpm test\n``\nmore", { streaming: true }).text, "npm test\n``\nmore");
  assert.equal(first("```bash\nrun ~\n~", { streaming: true }).text, "run ~\n~");
  assert.equal(first("```bash\nnpm test\n`").text, "npm test\n`");
});

test("a run that does close, and prose that never meant one, are left alone", () => {
  const closed = "**bold** and _more_ and ~~gone~~ and `code` here";
  assert.equal(first(closed, { streaming: true }).text, closed);
  assert.equal(first("2 * 3, and build_brief runs", { streaming: true }).text, "2 * 3, and build_brief runs");
  assert.equal(first("cd ~ then ls", { streaming: true }).text, "cd ~ then ls");
  assert.equal(first("Vibyra is **render").text, "Vibyra is **render");
});

test("spoken text drops the markup a voice would otherwise read aloud", () => {
  const doc = parseMarkdownDocument("# Title\n\nUse **bold** and `code`.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n");
  assert.equal(plainText(doc), "Title\n\nUse bold and code.\n\na: 1, b: 2");
});

test("column widths come from the header row alone", () => {
  assert.deepEqual(columnWidths(["one"], 420), [420]);
  assert.deepEqual(columnWidths(["id", "a much longer column name"], 400), [144, 256]);
  assert.deepEqual(columnWidths(["a", "b"], 400), [200, 200]);
  assert.deepEqual(columnWidths(["Surface", "Status", "Owner"], 320), [120, 120, 120]);
  assert.deepEqual(columnWidths(["a".repeat(40), "b", "c"], 320), [280, 120, 120]);
});

test("every prefix of a streamed reply keeps the blocks before its last one", () => {
  const kinds = new Set(parseMarkdownDocument(REPLY).blocks.map((block) => block.kind));
  assert.deepEqual([...kinds].sort(), ["code", "heading", "list", "paragraph", "quote", "rule", "table"]);
  // The ladder is only worth walking if it cuts through an open run on the way.
  const midRun = REPLY.slice(0, REPLY.indexOf("_fast_") + 3);
  assert.equal(parseMarkdownDocument(midRun, { streaming: true }).blocks.at(-1).text, "It is");
  let settled = [];
  for (let size = 1; size <= REPLY.length; size++) {
    const { blocks } = parseMarkdownDocument(REPLY.slice(0, size), { streaming: true });
    assert.deepEqual(blocks.slice(0, settled.length), settled, `prefix of ${size} characters`);
    const done = blocks.slice(0, -1);
    if (done.length > settled.length) settled = done;
  }
  assert.deepEqual(parseMarkdownDocument(REPLY).blocks.slice(0, settled.length), settled);
});
