import assert from "node:assert/strict";
import test from "node:test";

import {
  dropCarriesText,
  droppedPaths,
  fileUri,
  shellQuotePath,
  terminalDropText,
} from "../src/lib/terminalDrop.ts";

const transfer = (data) => ({
  getData: (type) => data[type] ?? "",
});

test("paths are quoted so a shell sees one argument", () => {
  assert.equal(shellQuotePath("/home/a b/shot.png"), "'/home/a b/shot.png'");
  assert.equal(shellQuotePath("/tmp/it's.png"), "'/tmp/it'\\''s.png'");
});

test("file URIs round-trip through the drop parser", () => {
  const paths = ["/home/a b/shot #1.png", "/tmp/it's.png", "/tmp/ünïcode.png"];
  for (const path of paths) {
    assert.deepEqual(droppedPaths(fileUri(path)), [path]);
  }
  // A drive letter stays readable rather than turning into %3A.
  assert.equal(fileUri("C:\\Users\\a\\shot.png"), "file:///C:/Users/a/shot.png");
  assert.deepEqual(droppedPaths("file:///C:/Users/a/shot.png"), ["C:/Users/a/shot.png"]);
});

test("only file entries of a uri-list become paths", () => {
  const list = "# comment\r\nfile:///tmp/a.png\r\nhttps://example.test/b.png\r\nfile:///tmp/c.png\r\n";
  assert.deepEqual(droppedPaths(list), ["/tmp/a.png", "/tmp/c.png"]);
  assert.deepEqual(droppedPaths(""), []);
});

test("dropped files are typed as quoted paths with room for the next argument", () => {
  const dropped = terminalDropText(transfer({
    "text/uri-list": "file:///tmp/a%20b.png\r\nfile:///tmp/c.png",
    "text/plain": "ignored while a file is on the drag",
  }));
  assert.equal(dropped, "'/tmp/a b.png' '/tmp/c.png' ");
});

test("a text drag is typed verbatim, and an empty one types nothing", () => {
  assert.equal(terminalDropText(transfer({ "text/plain": "git status" })), "git status");
  assert.equal(terminalDropText(transfer({})), null);
  assert.equal(terminalDropText(null), null);
});

test("a drag is accepted only when it carries something typable", () => {
  assert.equal(dropCarriesText(["text/uri-list", "text/plain"]), true);
  assert.equal(dropCarriesText(["Files"]), true);
  assert.equal(dropCarriesText(["application/x-vibyra-pane"]), false);
  assert.equal(dropCarriesText([]), false);
});
