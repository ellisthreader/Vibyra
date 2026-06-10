import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const sessionRoot = await mkdtemp(join(tmpdir(), "vibyra-terminal-editor-sessions-"));
process.env.VIBYRA_TERMINAL_SESSION_ROOT = sessionRoot;
const {
  listTerminalEditorFilesAtRoot,
  readTerminalEditorFileAtRoot,
  saveTerminalEditorFileAtRoot
} = await import(`./terminalEditor.mjs?test=${Date.now()}`);

test.after(async () => {
  await rm(sessionRoot, { recursive: true, force: true });
  delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
});

test("terminal editor lists, reads, and saves files inside its workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "vibyra-terminal-editor-"));
  try {
    await writeFile(join(root, "app.ts"), "const value = 1;\n");
    await writeFile(join(root, "image.bin"), "\u0000binary");
    await writeFile(join(root, ".gitignore"), "node_modules\n");

    const files = await listTerminalEditorFilesAtRoot(root);
    assert.deepEqual(files.map((file) => file.path).sort(), [".gitignore", "app.ts", "image.bin"]);
    assert.equal(files.find((file) => file.path === "app.ts")?.openable, true);
    assert.equal(files.find((file) => file.path === "image.bin")?.openable, false);
    await assert.rejects(readTerminalEditorFileAtRoot(root, "image.bin"), /file type/);

    const opened = await readTerminalEditorFileAtRoot(root, "app.ts", 7, 3);
    assert.equal(opened.content, "const value = 1;\n");
    assert.equal(opened.line, 7);
    assert.equal(opened.column, 3);

    const saved = await saveTerminalEditorFileAtRoot(
      root,
      "app.ts",
      "const value = 2;\n",
      opened.revision
    );
    assert.equal(saved.content, "const value = 2;\n");
    assert.equal(await readFile(join(root, "app.ts"), "utf8"), "const value = 2;\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("terminal editor rejects stale saves and symlink path escapes", async () => {
  const root = await mkdtemp(join(tmpdir(), "vibyra-terminal-editor-root-"));
  const outside = await mkdtemp(join(tmpdir(), "vibyra-terminal-editor-outside-"));
  try {
    await writeFile(join(root, "app.js"), "first\n");
    await writeFile(join(outside, "secret.js"), "secret\n");
    await symlink(join(outside, "secret.js"), join(root, "linked.js"));
    const opened = await readTerminalEditorFileAtRoot(root, "app.js");
    await writeFile(join(root, "app.js"), "changed elsewhere\n");

    await assert.rejects(
      saveTerminalEditorFileAtRoot(root, "app.js", "editor change\n", opened.revision),
      /changed on disk/
    );
    await assert.rejects(
      readTerminalEditorFileAtRoot(root, "linked.js"),
      /stay inside this terminal workspace/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
