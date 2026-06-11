import { readBody, send } from "./http.mjs";
import { promptProjectFilePaths } from "./projectContext.mjs";
import {
  deterministicTerminalTeamTopology,
  planTerminalTeam,
  validateTerminalTeamProposal
} from "./terminalTeamPlanner.mjs";
import { requestCloudTeamPlan } from "./terminalTeamPlannerClient.mjs";
import { requestProviderTeamPlan } from "./terminalTeamProviderPlanner.mjs";
import { inferTerminalTeamSignals } from "./terminalTeamPlannerInput.mjs";
import {
  MAX_PTY_TERMINAL_SESSIONS,
  launchPtyTerminalTeam,
  listPtyTerminals,
} from "./ptyTerminals.mjs";

export async function handleTerminalTeamRoutes(req, res, url) {
  if (req.method === "POST" && url.pathname === "/desktop/terminal-teams/launch") {
    await launchTerminalTeam(req, res);
    return true;
  }
  if (req.method !== "POST" || url.pathname !== "/desktop/terminal-teams/plan") {
    return false;
  }

  const body = await readBody(req);
  const planningController = new AbortController();
  const cancelPlanning = () => planningController.abort();
  req.once("aborted", cancelPlanning);
  res.once("close", () => {
    if (!res.writableEnded) cancelPlanning();
  });
  const input = {
    goal: body?.goal,
    teamSize: body?.teamSize,
    projectId: String(body?.projectId || "").trim(),
    model: String(body?.model || "").trim(),
    tokenMode: body?.tokenMode === "provider" ? "provider" : "vibyra",
    plannerMode: body?.plannerMode === "deterministic" ? "deterministic" : "cloud"
  };
  const projectFiles = await projectPaths(input.projectId, input.goal);
  if (planningController.signal.aborted) return true;
  input.signals = inferTerminalTeamSignals({ ...input, projectFiles });
  const roles = deterministicTerminalTeamTopology(input);
  let cloud = null;
  let fallbackReason = "";

  if (input.plannerMode === "cloud" && input.tokenMode === "provider") {
    try {
      cloud = await requestProviderTeamPlan(
        { ...input, roles, projectFiles },
        undefined,
        undefined,
        planningController.signal
      );
      input.plannerMode = "provider";
    } catch (error) {
      if (planningController.signal.aborted) return true;
      send(res, 502, {
        ok: false,
        error: error?.message || "Your AI account could not plan this Team.",
        code: String(error?.code || "provider_planner_failed")
      });
      return true;
    }
  } else if (input.plannerMode === "cloud") {
    try {
      cloud = await requestCloudTeamPlan({
        ...input,
        roles,
        projectFiles,
        signal: planningController.signal
      });
    } catch (error) {
      if (planningController.signal.aborted) return true;
      fallbackReason = String(error?.code || "planner_failed");
    }
  }

  if (input.plannerMode === "provider") {
    try {
      validateTerminalTeamProposal(cloud?.proposal, {
        ...input,
        plannerMode: "provider",
        plannerModel: cloud?.model
      });
    } catch {
      send(res, 502, {
        ok: false,
        error: "Your AI account returned an invalid Team plan. Try planning again.",
        code: "invalid_team_plan"
      });
      return true;
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

async function launchTerminalTeam(req, res) {
  const body = await readBody(req);
  const requests = Array.isArray(body?.terminals) ? body.terminals : [];
  if (requests.length < 2 || requests.length > 4) {
    send(res, 422, { ok: false, error: "A Team must contain between 2 and 4 terminals." });
    return;
  }
  if (listPtyTerminals().length + requests.length > MAX_PTY_TERMINAL_SESSIONS) {
    send(res, 429, { ok: false, error: "There is not enough terminal capacity to launch this Team." });
    return;
  }
  const planIds = new Set(requests.map((item) => String(item?.teamPlanId || "")));
  const teamIds = new Set(requests.map((item) => String(item?.teamId || "")));
  const roleKeys = new Set(requests.map((item) => String(item?.teamRoleKey || "")));
  const projects = new Set(requests.map((item) => String(item?.projectId || "")));
  const models = new Set(requests.map((item) => String(item?.model || "")));
  const tokenModes = new Set(requests.map((item) => String(item?.tokenMode || "")));
  if (planIds.size !== 1 || teamIds.size !== 1 || roleKeys.size !== requests.length || planIds.has("") || teamIds.has("")) {
    send(res, 422, { ok: false, error: "The Team launch request is incomplete or contains duplicate roles." });
    return;
  }
  if (projects.size !== 1 || models.size !== 1 || tokenModes.size !== 1) {
    send(res, 422, { ok: false, error: "Every Team member must use the same project, model, and token source." });
    return;
  }

  try {
    const launched = await launchPtyTerminalTeam(requests);
    send(res, 200, { ok: true, ...launched });
  } catch (error) {
    send(res, Number(error?.status) || 409, {
      ok: false,
      error: error instanceof Error ? error.message : "The Team could not be launched."
    });
  }
}

async function projectPaths(projectId, goal) {
  if (!projectId || projectId === "full-pc") return [];
  try {
    return await promptProjectFilePaths(projectId, goal, 18);
  } catch {
    return [];
  }
}
