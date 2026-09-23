import test from "node:test";
import assert from "node:assert/strict";

import {
  VIBYRA_TOOLS,
  findTool,
  parseArguments,
  toolSchemas,
} from "../src/lib/vibyraTools.ts";
import { MAX_TOOL_CALLS, afterTools, performToolCalls, toolTurn } from "../src/state/chatToolTurn.ts";

/** Stands in for the store-touching runner: these tests are about the rules
 * around a tool, not about what opening a terminal does. */
const stub = async (name) => ({ summary: `ran ${name}`, detail: `ran ${name}` });

test("the catalogue is the app, never the folder", () => {
  // The line this feature is built on: Vibyra's assistant runs Vibyra, and the
  // agents inside the terminals do the code. A tool that read or wrote a file
  // would put two things in one folder.
  const names = VIBYRA_TOOLS.map((tool) => tool.name);
  for (const forbidden of ["read_file", "write_file", "edit_file", "run_command", "shell"]) {
    assert.ok(!names.includes(forbidden), `${forbidden} does not belong to the workspace assistant`);
  }
  assert.ok(names.includes("open_terminals"));
  assert.ok(names.includes("list_terminals"));
  assert.ok(names.includes("read_terminal"));
});

test("every tool declares whether it changes anything", () => {
  for (const tool of VIBYRA_TOOLS) {
    assert.equal(typeof tool.changes, "boolean", `${tool.name} must say whether it acts`);
    assert.ok(tool.description.length > 20, `${tool.name} needs a description the model can use`);
    assert.equal(tool.parameters.type, "object");
  }
  // Looking is free; acting is not. Anything that only reports must be marked
  // harmless, or a future confirmation gate would stop the assistant answering.
  const reporting = ["list_terminals", "read_terminal", "list_projects", "list_agents"];
  for (const name of reporting) assert.equal(findTool(name)?.changes, false, name);
  assert.equal(findTool("open_terminals")?.changes, true);
  assert.equal(findTool("close_terminals")?.changes, true);
  assert.equal(findTool("send_to_terminal")?.changes, true);
});

test("the schemas go out in the shape OpenAI takes them", () => {
  const schemas = toolSchemas();
  assert.equal(schemas.length, VIBYRA_TOOLS.length);
  for (const schema of schemas) {
    assert.equal(schema.type, "function");
    assert.equal(typeof schema.function.name, "string");
    assert.equal(typeof schema.function.parameters, "object");
    // `changes` is ours; sending it would be an unknown field in the request.
    assert.equal("changes" in schema.function, false);
  }
});

test("open_terminals accepts what a person actually asks for", () => {
  const { properties, required } = findTool("open_terminals").parameters;
  // Nothing is required: naming only the model is a whole request.
  assert.deepEqual(required, []);
  assert.ok(properties.agent.enum.includes("codex"));
  assert.ok(properties.agent.enum.includes("shell"));
  // "five" has a ceiling: a misread count must not launch fifty processes.
  assert.equal(properties.count.maximum, 8);
  assert.equal(properties.count.minimum, 1);
  assert.ok(properties.model, "a model can be named, as the person said it");
  assert.ok(properties.project, "a project can be named rather than assumed");
  // Everything the owner asked to be able to say out loud.
  assert.deepEqual(properties.permission.enum, ["standard", "full"]);
  assert.ok(properties.effort, "reasoning effort is sayable");
  assert.ok(properties.prompt, "an opening prompt is sayable");
});

test("arguments a model mangled fail that call, not the conversation", () => {
  assert.deepEqual(parseArguments('{"agent":"codex","count":3}'), { agent: "codex", count: 3 });
  assert.deepEqual(parseArguments(""), {});
  assert.equal(parseArguments("{oh no"), null);
  assert.equal(parseArguments("[1,2]"), null, "a list is not a set of named arguments");
  assert.equal(parseArguments('"codex"'), null);
});

test("an unknown tool and unreadable arguments both report rather than throw", async () => {
  const performed = await performToolCalls(
    [
      { id: "1", name: "delete_everything", arguments: "{}" },
      { id: "2", name: "open_terminals", arguments: "{not json" },
    ],
    stub,
  );
  assert.equal(performed.length, 2);
  assert.ok(performed.every((entry) => entry.result.failed));
  assert.match(performed[0].result.detail, /no delete_everything action/);
  assert.match(performed[1].result.detail, /not valid JSON/);
});

test("one turn cannot act forever", async () => {
  const calls = Array.from({ length: MAX_TOOL_CALLS + 3 }, (_, index) => ({
    id: String(index),
    name: "list_projects",
    arguments: "{}",
  }));
  const performed = await performToolCalls(calls, stub);
  // The ones it ran, plus one line saying the rest were not run — silence
  // there would look like they had been.
  assert.equal(performed.length, MAX_TOOL_CALLS + 1);
  assert.equal(performed.at(-1).result.failed, true);
  assert.match(performed.at(-1).result.detail, /stopped/i);
});

test("an action becomes a line in the thread the model can answer from", () => {
  const turn = toolTurn(
    {
      call: { id: "1", name: "open_terminals", arguments: "{}" },
      result: { summary: "Opened 3 Codex terminals in HKE", detail: "Opened 3. They are #1, #2, #3." },
    },
    "turn-1",
  );
  assert.equal(turn.role, "tool");
  assert.equal(turn.status, "complete");
  assert.equal(turn.tool.name, "open_terminals");
  // The person reads the summary; the model reads the detail underneath it.
  assert.equal(turn.tool.summary, "Opened 3 Codex terminals in HKE");
  assert.equal(turn.content, "Opened 3. They are #1, #2, #3.");
});

test("a failed action is reported as failed, never as done", () => {
  // The bug in the screenshot: a refusal on screen, and the sentence under it
  // saying "Opened 3 terminals as requested".
  const report = afterTools([
    {
      call: { id: "1", name: "open_terminals", arguments: "{}" },
      result: { summary: 'No model here is called "GPT Astra"', detail: "...", failed: true },
    },
  ]);
  assert.match(report, /FAILED/);
  assert.match(report, /Never describe a failed action as done/);
  assert.match(report, /never say .as requested./);

  const good = afterTools([
    {
      call: { id: "1", name: "open_terminals", arguments: "{}" },
      result: { summary: "Opened 3 Codex terminals", detail: "..." },
    },
  ]);
  assert.match(good, /DONE/);
  assert.doesNotMatch(good, /FAILED/);
});
