import assert from "node:assert/strict";
import test from "node:test";

import { visibleFileEntries } from "../src/lib/fileTreePolicy.ts";
import { formatVaultContext } from "../src/lib/vaultContext.ts";

function entry(name, isDir) {
  return { name, isDir, path: `/project/${name}`, size: 0, modifiedMs: null };
}

test("keeps generated folders quiet while preserving normal project navigation", () => {
  const entries = [
    entry("src", true),
    entry("node_modules", true),
    entry("dist", true),
    entry("App.tsx", false),
    entry("README.md", false),
  ];
  assert.deepEqual(
    visibleFileEntries(entries, { query: "", showGenerated: false }).map(({ name }) => name),
    ["src", "App.tsx", "README.md"],
  );
  assert.deepEqual(
    visibleFileEntries(entries, { query: "app", showGenerated: false }).map(({ name }) => name),
    ["src", "App.tsx"],
  );
  assert.equal(
    visibleFileEntries(entries, { query: "", showGenerated: true }).length,
    entries.length,
  );
});

test("labels what the vault lent, and drops notes with nothing in them", () => {
  const context = formatVaultContext([
    { path: "Architecture/Terminal.md", content: "PTY sessions persist." },
    { path: "Empty.md", content: "   " },
  ]);
  assert.match(context, /read-only notes selected locally/);
  assert.match(context, /Architecture\/Terminal\.md/);
  assert.match(context, /PTY sessions persist\./);
  // A path with no body is noise, not context.
  assert.doesNotMatch(context, /Empty\.md/);
});

test("a vault with nothing to lend contributes nothing at all", () => {
  // The caller appends only on a truthy result, so silence has to be "".
  assert.equal(formatVaultContext([]), "");
  assert.equal(formatVaultContext([{ path: "Blank.md", content: "\n\n" }]), "");
});
