import assert from "node:assert/strict";
import test from "node:test";
import { appState } from "./state.mjs";
import { requestCloudTeamPlan } from "./terminalTeamPlannerClient.mjs";

test("cloud Team planner sends bounded goal, topology, and filtered paths", async () => {
  appState.desktopAccountToken = "desktop-token";
  let request;
  const result = await requestCloudTeamPlan({
    goal: "Build checkout safely",
    roles: ["coordinator", "builder", "reviewer"],
    projectFiles: [
      { path: "src/checkout.ts", language: "typescript" },
      { path: "../secret", language: "text" }
    ]
  }, async (url, options) => {
    request = { url, options };
    return jsonResponse({
      ok: true,
      model: "gpt-5.4-mini",
      creditCost: 1,
      plan: { assignments: [] }
    });
  });

  assert.match(request.url, /\/api\/chat\/team-plan$/);
  assert.equal(request.options.headers.Authorization, "Bearer desktop-token");
  const body = JSON.parse(request.options.body);
  assert.deepEqual(body.roles, ["coordinator", "builder", "reviewer"]);
  assert.deepEqual(body.projectContext.candidatePaths, ["src/checkout.ts"]);
  assert.equal(result.model, "gpt-5.4-mini");
  assert.equal(result.creditCost, 1);
});

test("cloud Team planner requires a desktop account", async () => {
  appState.desktopAccountToken = "";
  await assert.rejects(
    () => requestCloudTeamPlan({ goal: "Build", teamSize: 2 }),
    (error) => error?.code === "planner_auth_required"
  );
});

test("cloud Team planner reports credit failures as a bounded fallback reason", async () => {
  appState.desktopAccountToken = "desktop-token";
  await assert.rejects(
    requestCloudTeamPlan({
      goal: "Plan the work.",
      roles: ["builder", "reviewer"],
      projectFiles: []
    }, async () => ({
      ok: false,
      status: 402,
      json: async () => ({
        ok: false,
        code: "insufficient_credits",
        error: "You do not have enough credits."
      })
    })),
    { code: "planner_insufficient_credits" }
  );

  await assert.rejects(
    requestCloudTeamPlan({
      goal: "Plan the work.",
      roles: ["builder", "reviewer"],
      projectFiles: []
    }, async () => ({
      ok: false,
      status: 429,
      json: async () => ({
        ok: false,
        code: "planner_failed",
        error: "You do not have enough credits."
      })
    })),
    { code: "planner_insufficient_credits" }
  );
});

test("cloud Team planner identifies a backend without the planning endpoint", async () => {
  appState.desktopAccountToken = "desktop-token";
  await assert.rejects(
    requestCloudTeamPlan({
      goal: "Plan the work.",
      roles: ["builder", "reviewer"],
      projectFiles: []
    }, async () => ({
      ok: false,
      status: 405,
      json: async () => ({
        message: "The POST method is not supported for route api/chat/team-plan."
      })
    })),
    { code: "planner_endpoint_unavailable" }
  );
});

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}
