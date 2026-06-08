import test from "node:test";
import assert from "node:assert/strict";
import { parseDesktopMemoryProposal, proposeDesktopMemory } from "./desktopMemoryAi.mjs";

test("memory AI proposals accept fenced JSON and normalize paths", async () => {
  const result = await proposeDesktopMemory("project-1", {
    goal: "Document the architecture",
    provider: "local"
  }, async (body) => {
    assert.equal(body.disableDesktopActions, true);
    assert.equal(body.projectId, "project-1");
    return {
      reply: '```json\n{"summary":"Prepared","files":[{"path":"Project\\\\Architecture.md","markdown":"# Architecture"}]}\n```'
    };
  });

  assert.deepEqual(result.proposal, {
    summary: "Prepared",
    files: [{
      path: "Project/Architecture.md",
      markdown: "# Architecture",
      source: "markdown_import"
    }]
  });
});

test("memory AI proposals reject invalid model output", () => {
  assert.throws(() => parseDesktopMemoryProposal("I made some notes."), /valid memory proposal/);
  assert.throws(() => parseDesktopMemoryProposal('{"summary":"Empty","files":[]}'), /valid memory proposal/);
});
