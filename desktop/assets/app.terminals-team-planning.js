let terminalTeamPlanning = false;
let terminalTeamPlanningError = "";
let terminalTeamPlanRequest = 0;

function normalizeTerminalTeamText(value, limit = 500) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function terminalTeamRolePreviewHtml(roles, planning = false) {
  return roles.map((role) => `<div class="${planning ? "is-planning" : ""}" data-terminal-team-role="${escapeAttribute(role.key)}">
    <span>${icon(role.icon)}</span>
    <span><strong>${escapeHtml(role.title)}</strong><small data-terminal-team-objective>${escapeHtml(role.objective || role.detail)}</small></span>
  </div>`).join("");
}

function validateTerminalTeamPlan(result, expected = {}) {
  const plan = result?.ok === true && result.plan && typeof result.plan === "object"
    ? result.plan
    : null;
  const planId = normalizeTerminalTeamText(plan?.planId, 120);
  const teamId = normalizeTerminalTeamText(plan?.teamId, 120) || planId;
  const goal = normalizeTerminalTeamGoal(plan?.goal);
  const teamSize = Number(plan?.teamSize);
  const expectedGoal = normalizeTerminalTeamGoal(expected.goal);
  const expectedSize = Math.max(2, Math.min(4, Number(expected.teamSize) || 4));
  if (!plan || !planId || goal !== expectedGoal || teamSize !== expectedSize) {
    throw new Error("Vibyra returned a Team plan that did not match this setup.");
  }
  if (!Array.isArray(plan.assignments) || plan.assignments.length !== teamSize) {
    throw new Error("Vibyra returned an incomplete Team plan.");
  }
  const allowedKeys = terminalTeamRoles(teamSize).map((role) => role.key);
  const proposedAssignments = plan.assignments.map((assignment) => ({
    roleKey: normalizeTerminalTeamText(assignment?.roleKey, 40).toLowerCase(),
    title: normalizeTerminalTeamText(assignment?.title, 60),
    objective: normalizeTerminalTeamText(assignment?.objective, 500)
  }));
  const assignmentsByRole = new Map(proposedAssignments.map((assignment) => [assignment.roleKey, assignment]));
  if (proposedAssignments.some((assignment) => !assignment.title || !assignment.objective)
    || assignmentsByRole.size !== teamSize
    || allowedKeys.some((roleKey) => !assignmentsByRole.has(roleKey))) {
    throw new Error("Vibyra returned unsupported Team assignments.");
  }
  return {
    planId,
    teamId,
    teamSize,
    goal,
    plannerMode: normalizeTerminalTeamText(plan.plannerMode, 40) || "vibyra",
    plannerModel: normalizeTerminalTeamText(plan.plannerModel, 120),
    fallbackReason: normalizeTerminalTeamText(plan.fallbackReason, 80),
    assignments: allowedKeys.map((roleKey) => assignmentsByRole.get(roleKey))
  };
}

function terminalTeamPlanSourceLabel(plan) {
  if (plan?.plannerMode !== "deterministic") {
    return `AI-planned${plan?.plannerModel ? ` with ${plan.plannerModel}` : ""}`;
  }
  const reasons = {
    planner_auth_required: "not signed in",
    planner_insufficient_credits: "not enough credits",
    planner_endpoint_unavailable: "AI planner endpoint unavailable",
    planner_timeout: "AI planner timed out",
    planner_unavailable: "AI planner unavailable",
    planner_failed: "AI planner failed",
    team_plan_provider_error: "AI provider rejected the plan",
    invalid_team_plan: "AI returned an invalid plan"
  };
  return `Built-in fallback: ${reasons[plan?.fallbackReason] || "AI planning was unavailable"}`;
}

async function requestTerminalTeamPlan(payload = {}) {
  const goal = normalizeTerminalTeamGoal(payload.goal);
  const teamSize = Math.max(2, Math.min(4, Number(payload.teamSize) || 4));
  if (!goal) throw new Error("Describe what the team should accomplish.");
  const response = await fetch("/desktop/terminal-teams/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      goal,
      teamSize,
      projectId: String(payload.projectId || ""),
      model: String(payload.model || ""),
      executionMode: "parallel"
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Vibyra could not plan this team.");
  return validateTerminalTeamPlan(result, { goal, teamSize });
}

function setTerminalTeamPlanningUi(root, state, detail = "") {
  terminalTeamPlanning = state === "planning";
  terminalTeamPlanningError = state === "error" ? normalizeTerminalTeamText(detail, 240) : "";
  const setup = root?.querySelector?.("[data-terminal-team-setup]");
  setup?.classList.toggle("is-planning", terminalTeamPlanning);
  setup?.querySelectorAll("textarea, [data-terminal-count]").forEach((control) => {
    control.disabled = terminalTeamPlanning;
  });
  const preview = setup?.querySelector?.(".terminal-team-role-preview");
  preview?.setAttribute("aria-busy", String(terminalTeamPlanning));
  preview?.querySelectorAll("[data-terminal-team-role]").forEach((row) => {
    row.classList.toggle("is-planning", terminalTeamPlanning);
  });
  const status = setup?.querySelector?.("[data-terminal-team-status]");
  if (status) {
    status.textContent = terminalTeamPlanning
      ? "Designing focused assignments..."
      : terminalTeamPlanningError;
    status.classList.toggle("is-visible", terminalTeamPlanning || Boolean(terminalTeamPlanningError));
  }
}

function previewTerminalTeamPlan(root, plan) {
  const preview = root?.querySelector?.(".terminal-team-role-preview");
  if (!preview) return;
  const roles = plan.assignments.map((assignment) => ({
    ...terminalTeamRoleCatalog[assignment.roleKey],
    title: assignment.title,
    objective: assignment.objective
  }));
  preview.innerHTML = terminalTeamRolePreviewHtml(roles);
  preview.setAttribute("aria-busy", "false");
  preview.setAttribute("data-planner-source", plan.plannerMode || "");
  preview.classList.remove("is-planning");
  preview.classList.add("is-planned");
  const status = root?.querySelector?.("[data-terminal-team-status]");
  if (status) {
    status.textContent = terminalTeamPlanSourceLabel(plan);
    status.classList.add("is-visible");
  }
}

function revealTerminalTeamPlan() {
  return new Promise((resolve) => setTimeout(resolve, 360));
}

function terminalTeamPrompt(assignment, goal, index, total, planId) {
  return [
    "Vibyra Team assignment data follows.",
    "The desktop bridge supplies the trusted role and capability policy separately.",
    "",
    JSON.stringify({
      plan_id: planId,
      role: assignment.roleKey,
      lane: index + 1,
      lane_count: total,
      shared_goal: goal,
      assignment: assignment.objective
    }, null, 2)
  ].join("\n");
}

function createTerminalTeam(plan, modelKey, options = {}) {
  const goal = normalizeTerminalTeamGoal(plan?.goal);
  const planId = normalizeTerminalTeamText(plan?.planId, 120);
  const teamId = normalizeTerminalTeamText(plan?.teamId, 120) || planId;
  const assignments = Array.isArray(plan?.assignments) ? plan.assignments : [];
  if (!goal || !planId || !teamId || !assignments.length) return [];
  return assignments.map((assignment, index) => {
    const role = terminalTeamRoleCatalog[assignment.roleKey];
    if (!role) return null;
    return createTerminal(modelKey, false, {
      ...options,
      initialPrompt: terminalTeamPrompt(assignment, goal, index, assignments.length, planId),
      teamId,
      teamSize: assignments.length,
      teamGoal: goal,
      teamRole: assignment.title,
      teamRoleKey: role.key,
      teamPhase: role.key === "coordinator"
        ? "planning"
        : role.key === "builder"
          ? "building"
          : role.key === "verifier"
            ? "verifying"
            : "reviewing",
      teamCapability: role.key === "builder" ? "writer" : "read-only",
      teamTask: assignment.objective,
      teamPlanId: planId,
      teamPlannerMode: plan.plannerMode,
      teamPlannerModel: plan.plannerModel,
      teamPlannerFallbackReason: plan.fallbackReason,
      title: assignment.title
    });
  }).filter(Boolean);
}
