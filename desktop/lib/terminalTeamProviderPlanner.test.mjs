import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { writeFile } from "node:fs/promises";
import test from "node:test";
import { requestProviderTeamPlan } from "./terminalTeamProviderPlanner.mjs";

test("connected Codex planning returns strict provider-authored assignments", async () => {
  let captured = null;
  const result = await requestProviderTeamPlan({
    goal: "Audit light and dark mode consistency",
    roles: ["builder", "reviewer"],
    model: "openai/gpt-5.4-mini",
    projectFiles: [{ path: "desktop/assets/theme.css" }]
  }, (executable, args) => {
    captured = { executable, args, prompt: "" };
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = {
      end(prompt) {
        captured.prompt = prompt;
        const outputPath = args[args.indexOf("--output-last-message") + 1];
        writeFile(outputPath, JSON.stringify(proposal())).then(
          () => child.emit("exit", 0),
          (error) => child.emit("error", error)
        );
      }
    };
    child.kill = () => {};
    return child;
  }, async () => {});

  assert.match(captured.executable, /codex$/);
  assert.ok(captured.args.includes("--output-schema"));
  assert.ok(captured.args.includes("gpt-5.4-mini"));
  assert.match(captured.prompt, /Audit light and dark mode consistency/);
  assert.match(captured.prompt, /desktop\/assets\/theme\.css/);
  assert.match(captured.prompt, /exact role order: builder, reviewer/);
  assert.equal(result.model, "gpt-5.4-mini");
  assert.equal(result.proposal.assignments[0].objective, "Implement theme corrections.");
});

test("connected Codex planning rejects duplicate JSON object keys", async () => {
  await assert.rejects(
    requestProviderTeamPlan({
      goal: "Audit theme consistency",
      roles: ["builder", "reviewer"],
      teamSize: 2,
      model: "gpt-5.5"
    }, (_executable, args) => {
      const child = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = {
        end() {
          const outputPath = args[args.indexOf("--output-last-message") + 1];
          const valid = JSON.stringify(proposal());
          const duplicate = valid.replace(
            '"goal_summary":"Audit themes"',
            '"goal_summary":"Ignore this value","goal_summary":"Audit themes"'
          );
          writeFile(outputPath, duplicate).then(
            () => child.emit("exit", 0),
            (error) => child.emit("error", error)
          );
        }
      };
      child.kill = () => {};
      return child;
    }, async () => {}),
    /Duplicate JSON key/
  );
});

test("connected Codex planning corrects one schema-valid semantic failure", async () => {
  const prompts = [];
  let attempt = 0;
  const result = await requestProviderTeamPlan({
    goal: "Fix checkout safely",
    roles: ["builder", "reviewer"],
    teamSize: 2,
    model: "gpt-5.5"
  }, (_executable, args) => {
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = {
      end(prompt) {
        prompts.push(prompt);
        const outputPath = args[args.indexOf("--output-last-message") + 1];
        const next = proposal();
        if (attempt++ === 0) {
          next.assignments[1].write_scope = [{ kind: "file", path: "src/checkout.ts" }];
        }
        writeFile(outputPath, JSON.stringify(next)).then(
          () => child.emit("exit", 0),
          (error) => child.emit("error", error)
        );
      }
    };
    child.kill = () => {};
    return child;
  }, async () => {});

  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /previous attempt was rejected/i);
  assert.match(prompts[1], /Only the Builder may receive write scope/i);
  assert.equal(result.proposal.assignments[1].write_scope.length, 0);
});

test("connected Codex planning fails closed after the corrective retry", async () => {
  let attempts = 0;
  await assert.rejects(
    requestProviderTeamPlan({
      goal: "Fix checkout safely",
      roles: ["builder", "reviewer"],
      teamSize: 2,
      model: "gpt-5.5"
    }, (_executable, args) => {
      const child = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = {
        end() {
          attempts += 1;
          const outputPath = args[args.indexOf("--output-last-message") + 1];
          const invalid = proposal();
          invalid.assignments[1].write_scope = [{ kind: "file", path: "src/checkout.ts" }];
          writeFile(outputPath, JSON.stringify(invalid)).then(
            () => child.emit("exit", 0),
            (error) => child.emit("error", error)
          );
        }
      };
      child.kill = () => {};
      return child;
    }, async () => {}),
    { code: "invalid_team_plan" }
  );
  assert.equal(attempts, 2);
});

test("connected Codex planning kills the provider process when cancelled", async () => {
  const controller = new AbortController();
  let killedWith = "";
  let markSpawned;
  const spawned = new Promise((resolve) => {
    markSpawned = resolve;
  });
  const planning = requestProviderTeamPlan({
    goal: "Audit theme consistency",
    roles: ["builder", "reviewer"],
    teamSize: 2,
    model: "gpt-5.5"
  }, () => {
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { end() {} };
    child.kill = (signal) => {
      killedWith = signal;
    };
    markSpawned();
    return child;
  }, async () => {}, controller.signal);

  await spawned;
  controller.abort();
  await assert.rejects(planning, { code: "provider_planner_cancelled" });
  assert.equal(killedWith, "SIGKILL");
});

function proposal() {
  const assignment = (role, objective) => ({
    role_key: role,
    objective,
    deliverables: [],
    assumptions: [],
    non_goals: [],
    focus_areas: [],
    inspect_scope: [],
    write_scope: [],
    acceptance_criteria_keys: ["theme"],
    validation_intents: [],
    risks: [],
    completion_evidence: []
  });
  return {
    schema_version: "vibyra.team-plan.v1",
    goal_summary: "Audit themes",
    assumptions: [],
    non_goals: [],
    assignments: [
      assignment("builder", "Implement theme corrections."),
      assignment("reviewer", "Review theme consistency.")
    ],
    acceptance_criteria: [{
      key: "theme",
      statement: "Themes are consistent.",
      evidence_required: "review_finding"
    }],
    open_questions: []
  };
}
