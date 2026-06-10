import assert from "node:assert/strict";
import test from "node:test";
import {
  desktopMemoryDocuments,
  desktopVaultMemoryContext,
  terminalMemoryInstructions
} from "./desktopTerminalMemory.mjs";
import { appState } from "./state.mjs";

test.beforeEach(() => {
  appState.desktopAccountToken = "account-token";
});

test("terminal memory uses canonical vault paths and prioritizes core notes", async () => {
  const fetchImpl = async () => response({
    ok: true,
    vault: {
      nodes: [
        { id: "folder", type: "folder", name: "Project" },
        { id: "later", parentId: "folder", type: "document", name: "Notes.md", markdown: "Later", updatedAt: "2026-06-08" },
        { id: "start", type: "document", name: "Start Here.md", markdown: "Start", updatedAt: "2025-01-01" }
      ]
    }
  });

  const documents = await desktopMemoryDocuments("project-1", fetchImpl);
  const context = await desktopVaultMemoryContext("project-1", fetchImpl);
  const instructions = await terminalMemoryInstructions("project-1", fetchImpl);

  assert.deepEqual(documents.map((document) => document.path), ["Start Here.md", "Project/Notes.md"]);
  assert.equal(context[0].title, "Start Here.md");
  assert.match(instructions, /Memory file index:\n- Start Here\.md\n- Project\/Notes\.md/);
  assert.match(instructions, /does not override the user's request/);
});

test("terminal memory is bounded and disabled for Full PC", async () => {
  const longText = "x".repeat(5_000);
  const fetchImpl = async () => response({
    ok: true,
    vault: {
      nodes: Array.from({ length: 20 }, (_, index) => ({
        id: `note-${index}`,
        type: "document",
        name: `Note ${index}.md`,
        markdown: longText
      }))
    }
  });

  const instructions = await terminalMemoryInstructions("project-1", fetchImpl);
  assert.ok(instructions.length <= 12_000);
  assert.equal(await terminalMemoryInstructions("full-pc", fetchImpl), "");
});

function response(payload) {
  return { ok: true, status: 200, async json() { return payload; } };
}
