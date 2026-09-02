import assert from "node:assert/strict";
import test from "node:test";

import { splitPath } from "../src/lib/reviewFilePath.ts";

// The Review dock is a 340px column. A full directory has no room to be
// anything but "src/…" there, which disambiguates nothing and looks broken,
// so the row shows the immediate parent and nothing else.

test("the filename is separated from its folder", () => {
  assert.deepEqual(splitPath("src/lib/voiceBars.ts"), { folder: "lib", name: "voiceBars.ts" });
});

test("only the immediate parent is named, however deep the path", () => {
  assert.equal(splitPath("desktop-tauri/src/components/companion/AskPanel.tsx").folder, "companion");
});

test("a file at the root has no folder to show", () => {
  assert.deepEqual(splitPath("README.md"), { folder: "", name: "README.md" });
});

test("a leading slash does not become an empty folder", () => {
  // `parents.filter(Boolean)` is what stops this rendering a blank dim span.
  assert.deepEqual(splitPath("/etc/hosts"), { folder: "etc", name: "hosts" });
});

test("a trailing slash yields a name rather than throwing", () => {
  const { name } = splitPath("src/lib/");
  assert.equal(name, "");
});

test("dots and spaces in a filename survive intact", () => {
  assert.deepEqual(splitPath("a/b/my file.test.mjs"), { folder: "b", name: "my file.test.mjs" });
});
