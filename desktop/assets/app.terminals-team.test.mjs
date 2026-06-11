import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const planningSource = await readFile(new URL("./app.terminals-team-planning.js", import.meta.url), "utf8");
const source = await readFile(new URL("./app.terminals-team.js", import.meta.url), "utf8");
const styles = await readFile(new URL("./app.terminals-team-setup.css", import.meta.url), "utf8");
const appSource = await readFile(new URL("../app.html", import.meta.url), "utf8");

function createContext() {
  const created = [];
  const launched = [];
  const saved = [];
  const context = vm.createContext({
    activeTerminalId: "",
    created,
    launched,
    Date,
    Math,
    escapeAttribute: (value) => String(value),
    escapeHtml: (value) => String(value),
    fetch: async (url, options = {}) => {
      if (url === "/desktop/terminal-teams/launch") {
        const body = JSON.parse(options.body || "{}");
        launched.push(...body.terminals);
        return {
          ok: true,
          json: async () => ({
            sessions: body.terminals.map((terminal) => ({
              ...terminal,
              status: "running",
              providerState: "ready"
            }))
          })
        };
      }
      return { ok: true, json: async () => ({}) };
    },
    icon: (name) => `<svg data-icon="${name}"></svg>`,
    JSON,
    Promise,
    clearInterval,
    clearTimeout,
    setInterval,
    setTimeout,
    saveTerminals: () => saved.push(created.length),
    ptySessionPatch: (session) => session,
    connectPtyTerminal: () => {},
    createTerminal: (model, shouldRender, options) => {
      const terminal = {
        id: `terminal-${created.length + 1}`,
        model,
        pending: false,
        ptyStatus: "idle",
        ...options
      };
      created.push(terminal);
      return terminal;
    },
    terminalExecutionRuntimeForModel: (model) => model?.runtime || "",
    terminalStatusState: (terminal) => terminal.testState || { key: "idle", label: "Idle" }
  });
  vm.runInContext(planningSource, context);
  vm.runInContext(source, context);
  return context;
}

test("Team planning loads before Team policy while both remain focused", () => {
  const planningIndex = appSource.indexOf("app.terminals-team-planning.js");
  const teamIndex = appSource.indexOf("app.terminals-team.js");
  assert.ok(planningIndex >= 0);
  assert.ok(teamIndex > planningIndex);
  assert.doesNotMatch(source, /async function requestTerminalTeamPlan|function validateTerminalTeamPlan/);
  assert.match(planningSource, /async function requestTerminalTeamPlan/);
  assert.match(planningSource, /function validateTerminalTeamPlan/);
  assert.match(planningSource, /function createTerminalTeam/);
});

test("Team sizes map to scoped roles with exactly one production-code owner", () => {
  const context = createContext();
  const roles = vm.runInContext("terminalTeamRoles(4)", context);
  assert.deepEqual(Array.from(roles, (role) => role.key), ["coordinator", "builder", "verifier", "reviewer"]);
  assert.equal(roles.filter((role) => !role.editPolicy.startsWith("Remain read-only")).length, 1);
  assert.equal(vm.runInContext("terminalTeamRoles(2).length", context), 2);
  assert.equal(vm.runInContext("terminalTeamRoles(8).length", context), 4);
});

test("creating a Team launches distinct assignments under one team id", async () => {
  const context = createContext();
  vm.runInContext(`globalThis.plan = {
    planId: "team-plan-123",
    teamId: "team-run-4567",
    teamSize: 4,
    goal: "Fix checkout safely and verify the result.",
    plannerMode: "cloud",
    assignments: [
      { roleKey: "coordinator", title: "Checkout Coordinator", objective: "Map the checkout flow and identify safe ownership boundaries." },
      { roleKey: "builder", title: "Checkout Builder", objective: "Implement the confirmed checkout fixes without unrelated edits." },
      { roleKey: "verifier", title: "Payment Verifier", objective: "Run the strongest focused payment and checkout checks." },
      { roleKey: "reviewer", title: "Checkout Reviewer", objective: "Review the resulting changes for regressions and security risks." }
    ]
  };`, context);
  const terminals = await vm.runInContext(
    'createTerminalTeam(plan, "codex", { permissionMode: "safe" })',
    context
  );
  assert.equal(terminals.length, 4);
  assert.equal(new Set(terminals.map((terminal) => terminal.teamId)).size, 1);
  assert.equal(terminals[0].teamId, "team-run-4567");
  assert.ok(terminals.every((terminal) => terminal.teamPlanId === "team-plan-123"));
  assert.ok(terminals.every((terminal) => terminal.teamPlannerMode === "cloud"));
  assert.equal(new Set(terminals.map((terminal) => terminal.teamRoleKey)).size, 4);
  assert.equal(new Set(context.launched.map((terminal) => terminal.initialPrompt)).size, 4);
  assert.equal(terminals.filter((terminal) => terminal.teamRoleKey === "builder").length, 1);
  assert.equal(terminals.filter((terminal) => terminal.teamCapability === "writer").length, 1);
  assert.equal(terminals.filter((terminal) => terminal.teamCapability === "read-only").length, 3);
  assert.ok(terminals.every((terminal) => terminal.teamSize === 4));
  assert.ok(context.launched.every((terminal) => terminal.initialPrompt.includes("Fix checkout safely")));
  assert.ok(context.launched.every((terminal) => terminal.initialPrompt.includes("trusted role and capability policy separately")));
  assert.ok(context.launched.some((terminal) => terminal.initialPrompt.includes("Map the checkout flow")));
  assert.ok(terminals.some((terminal) => terminal.teamTask.includes("confirmed checkout fixes")));
  assert.ok(terminals.every((terminal) => terminal.permissionMode === "safe"));
});

test("the Team bar reports observed terminal state without fake progress claims", () => {
  const context = createContext();
  vm.runInContext(
    `activeTerminalId = "builder";
     globalThis.items = [
       { id: "builder", title: "Builder", teamId: "team-1", teamGoal: "Fix checkout", teamRole: "Builder", teamPlannerMode: "deterministic", teamPlannerFallbackReason: "planner_auth_required", pending: true, testState: { key: "running", label: "Running" } },
       { id: "reviewer", title: "Reviewer", teamId: "team-1", teamGoal: "Fix checkout", teamRole: "Reviewer", notice: "Review required", testState: { key: "idle", label: "Idle" } }
     ];`,
    context
  );
  const html = vm.runInContext("terminalTeamBarHtml(items)", context);
  assert.match(html, /Fix checkout/);
  assert.match(html, /1 working/);
  assert.match(html, /Built-in fallback: not signed in/);
  assert.match(html, /Builder/);
  assert.match(html, /Needs attention/);
  assert.match(html, /data-terminal-focus="builder"/);
  assert.doesNotMatch(html, /\d+%|merged|conflict-free|complete/i);
});

test("empty or control-only goals cannot launch a Team", async () => {
  const context = createContext();
  assert.equal((await vm.runInContext('createTerminalTeam({ planId: "plan-1", goal: "\\u0000\\u0007", assignments: [] }, "codex")', context)).length, 0);
  assert.equal(vm.runInContext('normalizeTerminalTeamGoal("  ship\\n safely  ")', context), "ship safely");
});

test("restored Team members with missing identifiers receive one shared valid id", () => {
  const context = createContext();
  vm.runInContext(`globalThis.restored = [
    { projectId: "one", model: "codex", tokenMode: "vibyra", teamSize: 2, teamGoal: "Fix checkout", teamRoleKey: "builder" },
    { projectId: "one", model: "codex", tokenMode: "vibyra", teamSize: 2, teamGoal: "Fix checkout", teamRoleKey: "reviewer" }
  ]; repairTerminalTeamIds(restored);`, context);
  const restored = context.restored;
  assert.match(restored[0].teamId, /^team-[a-z0-9-]{8,100}$/);
  assert.equal(restored[0].teamId, restored[1].teamId);
  const fields = vm.runInContext("terminalTeamRequestFields(restored[0], restored)", context);
  assert.deepEqual(
    { ...fields },
    {
      teamId: restored[0].teamId,
      teamSize: 2,
      teamGoal: "Fix checkout",
      teamRoleKey: "builder"
    }
  );
});

test("solo requests omit Team fields and incomplete Team records fail locally", () => {
  const context = createContext();
  assert.deepEqual({ ...vm.runInContext("terminalTeamRequestFields({ id: 'solo' }, [])", context) }, {});
  assert.throws(
    () => vm.runInContext("terminalTeamRequestFields({ teamId: 'team-abcdefgh', teamSize: 2 }, [])", context),
    /incomplete/
  );
});

test("bridge plans must match the requested goal and topology while normalizing role order", () => {
  const context = createContext();
  const plan = vm.runInContext(`validateTerminalTeamPlan({
    ok: true,
    plan: {
      planId: "plan-2",
      teamSize: 2,
      goal: "Fix checkout",
      plannerMode: "cloud",
      assignments: [
        { roleKey: "builder", title: "Checkout Builder", objective: "Fix the confirmed checkout regression." },
        { roleKey: "reviewer", title: "Payment Reviewer", objective: "Review checkout correctness and payment safety." }
      ]
    }
  }, { goal: "Fix checkout", teamSize: 2 })`, context);
  assert.equal(plan.planId, "plan-2");
  assert.equal(plan.plannerMode, "cloud");
  assert.equal(plan.assignments[0].title, "Checkout Builder");
  const reordered = vm.runInContext(`validateTerminalTeamPlan({
    ok: true,
    plan: {
      planId: "plan-3",
      teamSize: 2,
      goal: "Fix checkout",
      assignments: [
        { roleKey: "reviewer", title: "Reviewer", objective: "Review the result." },
        { roleKey: "builder", title: "Builder", objective: "Build the fix." }
      ]
    }
  }, { goal: "Fix checkout", teamSize: 2 })`, context);
  assert.deepEqual(Array.from(reordered.assignments, (assignment) => assignment.roleKey), ["builder", "reviewer"]);
  assert.throws(
    () => vm.runInContext(`validateTerminalTeamPlan({
      ok: true,
      plan: {
        planId: "bad-plan",
        teamSize: 2,
        goal: "Fix checkout",
        assignments: [
          { roleKey: "builder", title: "Builder one", objective: "Build first." },
          { roleKey: "builder", title: "Builder two", objective: "Build second." }
        ]
      }
    }, { goal: "Fix checkout", teamSize: 2 })`, context),
    /unsupported Team assignments/
  );
});

test("Team planning labels AI plans and built-in fallbacks", () => {
  const context = createContext();
  assert.equal(
    vm.runInContext('terminalTeamPlanSourceLabel({ plannerMode: "mini", plannerModel: "gpt-5.4-mini" })', context),
    "AI-planned with gpt-5.4-mini"
  );
  assert.equal(
    vm.runInContext('terminalTeamPlanSourceLabel({ plannerMode: "deterministic", fallbackReason: "planner_failed" })', context),
    "Built-in fallback: AI planner failed"
  );
  assert.equal(
    vm.runInContext('terminalTeamPlanSourceLabel({ plannerMode: "deterministic", fallbackReason: "planner_insufficient_credits" })', context),
    "Built-in fallback: not enough credits"
  );
  assert.equal(
    vm.runInContext('terminalTeamPlanSourceLabel({ plannerMode: "deterministic", fallbackReason: "planner_endpoint_unavailable" })', context),
    "Built-in fallback: AI planner endpoint unavailable"
  );
});

test("Team planning posts the setup intent and validates the bridge response", async () => {
  const context = createContext();
  let request = null;
  context.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      json: async () => ({
        ok: true,
        plan: {
          planId: "plan-request",
          teamSize: 2,
          goal: "Fix checkout",
          plannerMode: "cloud",
          assignments: [
            { roleKey: "builder", title: "Checkout Builder", objective: "Implement the checkout fix." },
            { roleKey: "reviewer", title: "Checkout Reviewer", objective: "Review the checkout fix." }
          ]
        }
      })
    };
  };
  const plan = await vm.runInContext(`requestTerminalTeamPlan({
    goal: "Fix checkout",
    teamSize: 2,
    projectId: "project-1",
    model: "gpt-5.5"
  })`, context);
  assert.equal(request.url, "/desktop/terminal-teams/plan");
  assert.equal(request.options.method, "POST");
  assert.deepEqual(JSON.parse(request.options.body), {
    goal: "Fix checkout",
    teamSize: 2,
    projectId: "project-1",
    model: "gpt-5.5",
    tokenMode: "vibyra",
    executionMode: "parallel"
  });
  assert.equal(plan.assignments[1].objective, "Review the checkout fix.");
  assert.equal(plan.teamId, "plan-request");
});

test("automatic Team sizing lets the planner choose the smallest valid topology", async () => {
  const context = createContext();
  let requestBody = null;
  context.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        ok: true,
        plan: {
          planId: "plan-automatic",
          teamSize: 2,
          goal: "Audit theme consistency",
          plannerMode: "cloud",
          assignments: [
            { roleKey: "builder", title: "Theme Builder", objective: "Fix the confirmed theme inconsistencies." },
            { roleKey: "reviewer", title: "Theme Reviewer", objective: "Review both themes for regressions." }
          ]
        }
      })
    };
  };
  const plan = await vm.runInContext(`requestTerminalTeamPlan({
    goal: "Audit theme consistency",
    teamSize: 0,
    projectId: "project-1",
    model: "gpt-5.5"
  })`, context);
  assert.equal(requestBody.teamSize, 0);
  assert.equal(plan.teamSize, 2);
});

test("Team planning reports only real request phases", async () => {
  const context = createContext();
  const phases = [];
  context.fetch = async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      plan: {
        planId: "plan-phases",
        teamSize: 2,
        goal: "Audit theme consistency",
        assignments: [
          { roleKey: "builder", title: "Theme Builder", objective: "Fix theme inconsistencies." },
          { roleKey: "reviewer", title: "Theme Reviewer", objective: "Review both themes." }
        ]
      }
    })
  });
  context.recordPhase = (phase) => phases.push(phase);
  await vm.runInContext(`requestTerminalTeamPlan({
    goal: "Audit theme consistency",
    teamSize: 2
  }, { onPhase: recordPhase })`, context);
  assert.deepEqual(phases, ["analyzing", "validating"]);
});

test("Team planning spreads waiting phases once without looping", () => {
  const context = createContext();
  const scheduled = [];
  const copy = {
    classList: { add() {}, remove() {} },
    innerHTML: "",
    offsetWidth: 120
  };
  context.phaseRoot = {
    querySelector: (selector) => selector === "[data-terminal-team-planning-copy]" ? copy : null
  };
  context.setTimeout = (callback, delay) => {
    scheduled.push({ callback, delay });
    return scheduled.length;
  };
  context.clearTimeout = () => {};
  vm.runInContext("terminalTeamPlanning = true; startTerminalTeamPlanningPhases(phaseRoot)", context);
  assert.deepEqual(scheduled.map(({ delay }) => delay), [3000, 7000]);
  scheduled[0].callback();
  assert.match(copy.innerHTML, /Planning team roles/);
  scheduled[1].callback();
  assert.match(copy.innerHTML, /Assigning individual roles/);
  assert.equal(scheduled.length, 2);
});

test("Team setup keeps Cancel visible and moves live planning feedback into the launch action", () => {
  assert.match(source, /Describe the outcome/);
  assert.match(source, /Vibyra will plan the smallest useful team\./);
  assert.doesNotMatch(source, /data-terminal-team-planning-activity/);
  assert.match(source, /class="terminal-team-role-preview"[^>]*hidden/);
  assert.match(source, /label: "Automatic"/);
  assert.doesNotMatch(source, /terminal-team-role-card/);
  assert.match(planningSource, /function terminalTeamPlanningButtonHtml/);
  assert.match(planningSource, /Analyzing your prompt/);
  assert.match(planningSource, /Planning team roles/);
  assert.match(planningSource, /Assigning individual roles/);
  assert.match(planningSource, /Validating assignments/);
  assert.match(planningSource, /Preparing terminals/);
  assert.match(planningSource, /delay: 3000/);
  assert.match(planningSource, /delay: 7000/);
  assert.doesNotMatch(planningSource, /setInterval/);
  assert.match(planningSource, /function startTerminalTeamPlanningPhases/);
  assert.match(planningSource, /function stopTerminalTeamPlanningPhases/);
  assert.match(planningSource, /terminalTeamPlanningPhase = phase/);
  assert.match(planningSource, /terminalTeamPlanningButtonHtml\(terminalTeamPlanningPhase\)/);
  assert.doesNotMatch(planningSource, /Cancel planning/);
  assert.match(planningSource, /function cancelTerminalTeamPlanning/);
  assert.match(planningSource, /terminalTeamPlanController\?\.abort/);
  assert.match(planningSource, /preview\.hidden = true/);
  assert.match(planningSource, /preview\.innerHTML = ""/);
  assert.match(planningSource, /status\.textContent = ""/);
  assert.match(planningSource, /button\?\.classList\.toggle\("is-team-planning"/);
  assert.match(planningSource, /aria-busy/);
  assert.match(planningSource, /\[data-terminal-team-size\]/);
  assert.doesNotMatch(planningSource, /data-terminal-team-planning-activity/);
  assert.match(styles, /\.terminal-start-button\.is-team-planning/);
  assert.match(styles, /terminal-team-planning-sweep/);
  assert.match(styles, /terminal-team-planning-ring/);
  assert.match(styles, /terminal-team-planning-dot/);
  assert.match(styles, /terminal-team-phase-change/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("Team setup exposes only runtimes with a trusted role channel", () => {
  const context = createContext();
  assert.equal(
    vm.runInContext('terminalTeamRuntimeIssue({ key: "gpt-5.5", runtime: "codex" }, "provider")', context),
    ""
  );
  assert.match(
    vm.runInContext('terminalTeamRuntimeIssue({ key: "google/gemini-2.5-pro", runtime: "gemini" }, "provider")', context),
    /cannot yet enforce/
  );
  assert.match(
    vm.runInContext('terminalTeamRuntimeIssue({ key: "auto", runtime: "" }, "vibyra")', context),
    /concrete model/
  );
});
