import test from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { FULL_PC_PROJECT_ID, projectById, terminalProjectById } from "./projects.mjs";

test("Full PC project scope resolves only for terminals", () => {
  const project = terminalProjectById(FULL_PC_PROJECT_ID);

  assert.equal(projectById(FULL_PC_PROJECT_ID), null);
  assert.equal(project.id, "full-pc");
  assert.equal(project.name, "Full PC");
  assert.equal(project.path, homedir());
  assert.equal(project.briefRequired, false);
});

test("manufactured encoded project IDs are not trusted", () => {
  const encoded = Buffer.from("/home/ellis/.ssh").toString("base64url");

  assert.equal(projectById(encoded), null);
  assert.equal(terminalProjectById(encoded), null);
});
