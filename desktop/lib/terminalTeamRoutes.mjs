import { readBody, send } from "./http.mjs";
import { promptProjectFilePaths } from "./projectContext.mjs";
import {
  deterministicTerminalTeamTopology,
  planTerminalTeam
} from "./terminalTeamPlanner.mjs";
import { requestCloudTeamPlan } from "./terminalTeamPlannerClient.mjs";

export async function handleTerminalTeamRoutes(req, res, url) {
  if (req.method !== "POST" || url.pathname !== "/desktop/terminal-teams/plan") {
    return false;
  }

  const body = await readBody(req);
  const input = {
    goal: body?.goal,
    teamSize: body?.teamSize,
    projectId: String(body?.projectId || "").trim(),
    plannerMode: body?.plannerMode === "deterministic" ? "deterministic" : "cloud"
  };
  const projectFiles = await projectPaths(input.projectId, input.goal);
  const roles = deterministicTerminalTeamTopology(input);
  let cloud = null;
  let fallbackReason = "";

  if (input.plannerMode === "cloud") {
    try {
      cloud = await requestCloudTeamPlan({ ...input, roles, projectFiles });
    } catch (error) {
      fallbackReason = String(error?.code || "planner_failed");
    }
  }

  const plan = planTerminalTeam(
    {
      ...input,
      projectFiles,
      fallbackReason,
      plannerModel: cloud?.model || "gpt-5.4-mini"
    },
    { proposal: cloud?.proposal }
  );
  send(res, 200, {
    ok: true,
    plan,
    creditCost: cloud?.creditCost ?? null
  });
  return true;
}

async function projectPaths(projectId, goal) {
  if (!projectId || projectId === "full-pc") return [];
  try {
    return await promptProjectFilePaths(projectId, goal, 18);
  } catch {
    return [];
  }
}
