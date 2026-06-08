import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildDesktopActionDataset } from "../evals/action-parsing/generate.mjs";
import { desktopActionsForPrompt } from "./desktopActions.mjs";

const datasetUrl = new URL("../evals/action-parsing/cases.jsonl", import.meta.url);

test("generated desktop action dataset is large, unique, and covers terminal tasks", () => {
  const generated = buildDesktopActionDataset();

  assert.ok(generated.length >= 15_000, `expected at least 15,000 examples, found ${generated.length}`);
  assert.equal(new Set(generated.map((item) => item.id)).size, generated.length);
  assert.equal(
    new Set(generated.map((item) => normalizePrompt(item.prompt))).size,
    generated.length,
    "dataset prompts must be unique after whitespace and case normalization"
  );

  const terminalTaskCases = generated.filter((item) => item.category === "run_terminal_tasks");
  assert.ok(terminalTaskCases.length >= 35, "expected broad and explicit terminal task coverage");
  assert.ok(terminalTaskCases.some((item) => item.prompt.includes("\n")), "expected multiline task-list coverage");
  for (const item of terminalTaskCases) {
    const action = item.expected.action;
    assert.equal(action.type, "run_terminal_tasks");
    assert.equal(typeof action.model, "string");
    assert.ok(["low", "medium", "high", "xhigh"].includes(action.effort));
    assert.ok(["standard", "full"].includes(action.permissionMode));
    assert.equal(typeof action.projectId, "string");
    assert.ok(action.tasks.length >= 2);
    for (const task of action.tasks) {
      assert.deepEqual(Object.keys(task), ["task"]);
      assert.equal(typeof task.task, "string");
      assert.ok(task.task.length > 0);
    }
  }

  const terminalTaskSafetyCases = generated.filter((item) =>
    item.category === "no_action" && /tasks?.*terminals?|terminals?.*tasks?/i.test(item.prompt)
  );
  assert.ok(terminalTaskSafetyCases.length >= 8, "expected terminal task no-action safety coverage");
  assert.ok(
    terminalTaskSafetyCases.some((item) => /^(?:don't|do not|never)\b/i.test(item.prompt)),
    "expected negated terminal task coverage"
  );
});

test("checked-in desktop action dataset matches the current generator", () => {
  const checkedIn = readDataset();
  const generated = buildDesktopActionDataset();
  assert.equal(
    checkedIn.length,
    generated.length,
    `cases.jsonl is stale (${checkedIn.length} checked in, ${generated.length} generated); run npm run desktop:ai:dataset`
  );
  for (let index = 0; index < generated.length; index += 1) {
    assert.deepEqual(
      checkedIn[index],
      generated[index],
      `cases.jsonl differs at index ${index}; run npm run desktop:ai:dataset`
    );
  }
});

test("generated desktop action dataset fully passes the deterministic parser", () => {
  const failures = [];
  for (const item of buildDesktopActionDataset()) {
    const result = desktopActionsForPrompt(item.prompt, item.context);
    try {
      if (item.expected.kind === "no_action") {
        assert.equal(result, null);
      } else {
        assert.deepEqual(result?.actions?.[0], item.expected.action);
      }
    } catch (error) {
      failures.push(`${item.id}: ${item.prompt}\n${error.message}`);
      if (failures.length >= 20) break;
    }
  }
  assert.deepEqual(failures, []);
});

function readDataset() {
  return readFileSync(datasetUrl, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function normalizePrompt(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}
