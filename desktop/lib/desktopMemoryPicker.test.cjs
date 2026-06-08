const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, mkdir, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { readSelectedFiles, readVaultFiles } = require("./desktopMemoryPicker.cjs");

test("native picker reads selected Markdown and normalizes extensions", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vibyra-memory-"));
  const markdown = path.join(root, "Notes.md");
  const legacy = path.join(root, "Legacy.markdown");
  await writeFile(markdown, "# Notes");
  await writeFile(legacy, "Legacy");

  const files = await readSelectedFiles([markdown, legacy]);
  assert.deepEqual(files.map(({ path: name, markdown: body }) => [name, body]), [
    ["Notes.md", "# Notes"],
    ["Legacy.md", "Legacy"]
  ]);
});

test("native vault picker preserves folders and ignores Obsidian metadata", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vibyra-vault-"));
  await mkdir(path.join(root, "Project"));
  await mkdir(path.join(root, ".obsidian"));
  await writeFile(path.join(root, "Project", "Architecture.md"), "# Architecture");
  await writeFile(path.join(root, ".obsidian", "config.md"), "ignore");

  const files = await readVaultFiles(root);
  assert.deepEqual(files.map(({ path: name }) => name), ["Project/Architecture.md"]);
});
