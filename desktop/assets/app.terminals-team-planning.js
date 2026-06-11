let terminalTeamPlanning = false;
let terminalTeamPlanningError = "";
let terminalTeamPlanRequest = 0;
let terminalTeamPlanController = null;
let terminalTeamPlanningPhaseTimeouts = [];
let terminalTeamPlanningPhase = "analyzing";

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
  const requestedSize = [2, 3, 4].includes(Number(expected.teamSize))
    ? Number(expected.teamSize)
    : 0;
  if (!plan || !planId || goal !== expectedGoal
    || ![2, 3, 4].includes(teamSize)
    || (requestedSize && teamSize !== requestedSize)) {
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

function terminalTeamPlanningPhaseCopy(phase = "analyzing") {
  const phases = {
    analyzing: ["Analyzing your prompt", "Reading the outcome and project context"],
    roles: ["Planning team roles", "Shaping focused responsibilities for each agent"],
    assignments: ["Assigning individual roles", "Separating ownership and avoiding overlap"],
    validating: ["Validating assignments", "Checking roles, scope, and safety"],
    preparing: ["Preparing terminals", "Applying the approved team plan"]
  };
  return phases[phase] || phases.analyzing;
}

function terminalTeamPlanningButtonHtml(phase = terminalTeamPlanningPhase) {
  const [title, detail] = terminalTeamPlanningPhaseCopy(phase);
  return `<span class="terminal-team-planning-mark" aria-hidden="true">${icon("people")}<i></i><i></i></span>
    <span class="terminal-team-planning-copy" data-terminal-team-planning-copy><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></span>
    <span class="terminal-team-planning-dots" aria-hidden="true"><i></i><i></i><i></i></span>`;
}

function setTerminalTeamPlanningPhase(root, phase) {
  terminalTeamPlanningPhase = phase;
  const copy = root?.querySelector?.("[data-terminal-team-planning-copy]");
  if (!copy) return;
  const [title, detail] = terminalTeamPlanningPhaseCopy(phase);
  copy.innerHTML = `<strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small>`;
  copy.classList.remove("is-changing");
  void copy.offsetWidth;
  copy.classList.add("is-changing");
}

function startTerminalTeamPlanningPhases(root) {
  stopTerminalTeamPlanningPhases();
  terminalTeamPlanningPhase = "analyzing";
  [
    { phase: "roles", delay: 3000 },
    { phase: "assignments", delay: 7000 }
  ].forEach(({ phase, delay }) => {
    terminalTeamPlanningPhaseTimeouts.push(setTimeout(() => {
      if (terminalTeamPlanning) setTerminalTeamPlanningPhase(root, phase);
    }, delay));
  });
}

function stopTerminalTeamPlanningPhases() {
  terminalTeamPlanningPhaseTimeouts.forEach((timeout) => clearTimeout(timeout));
  terminalTeamPlanningPhaseTimeouts = [];
}

async function requestTerminalTeamPlan(payload = {}, options = {}) {
  const goal = normalizeTerminalTeamGoal(payload.goal);
  const teamSize = [2, 3, 4].includes(Number(payload.teamSize))
    ? Number(payload.teamSize)
    : 0;
  if (!goal) throw new Error("Describe what the team should accomplish.");
  options.onPhase?.("analyzing");
  const response = await fetch("/desktop/terminal-teams/plan", {
    method: "POST",
    signal: options.signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      goal,
      teamSize,
      projectId: String(payload.projectId || ""),
      model: String(payload.model || ""),
      tokenMode: payload.tokenMode === "provider" ? "provider" : "vibyra",
      executionMode: "parallel"
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Vibyra could not plan this team.");
  stopTerminalTeamPlanningPhases();
  options.onPhase?.("validating");
  return validateTerminalTeamPlan(result, { goal, teamSize });
}

function setTerminalTeamPlanningUi(root, state, detail = "") {
  terminalTeamPlanning = state === "planning";
  terminalTeamPlanningError = state === "error" ? normalizeTerminalTeamText(detail, 240) : "";
  const setup = root?.querySelector?.("[data-terminal-team-setup]");
  setup?.classList.toggle("is-planning", terminalTeamPlanning);
  setup?.querySelectorAll("textarea, [data-terminal-count], [data-terminal-team-size]").forEach((control) => {
    control.disabled = terminalTeamPlanning;
  });
  const button = root?.querySelector?.("#start-terminals");
  button?.classList.toggle("is-team-planning", terminalTeamPlanning);
  if (button) {
    button.setAttribute("aria-busy", String(terminalTeamPlanning));
    if (terminalTeamPlanning) button.innerHTML = terminalTeamPlanningButtonHtml(terminalTeamPlanningPhase);
  }
  const cancel = root?.querySelector?.("[data-terminal-team-cancel]");
  if (cancel) {
    cancel.textContent = "Cancel";
    cancel.classList.toggle("is-planning", terminalTeamPlanning);
  }
  const preview = setup?.querySelector?.(".terminal-team-role-preview");
  if (preview && state === "planning") {
    preview.hidden = true;
    preview.innerHTML = "";
    preview.classList.remove("is-planned");
  }
  preview?.setAttribute("aria-busy", String(terminalTeamPlanning));
  preview?.querySelectorAll("[data-terminal-team-role]").forEach((row) => {
    row.classList.toggle("is-planning", terminalTeamPlanning);
  });
  const status = setup?.querySelector?.("[data-terminal-team-status]");
  if (status) {
    status.textContent = terminalTeamPlanningError;
    status.classList.toggle("is-visible", Boolean(terminalTeamPlanningError));
  }
}

function cancelTerminalTeamPlanning(root) {
  stopTerminalTeamPlanningPhases();
  terminalTeamPlanningPhase = "analyzing";
  terminalTeamPlanController?.abort();
  terminalTeamPlanController = null;
  terminalTeamPlanRequest += 1;
  const button = root?.querySelector?.("#start-terminals");
  if (button) {
    delete button.dataset.terminalLaunchBusy;
    button.disabled = button.dataset.terminalLaunchReady !== "true"
      || !normalizeTerminalTeamGoal(setupTeamGoal);
    button.innerHTML = `${icon("arrow")}Plan and start team`;
  }
  const preview = root?.querySelector?.(".terminal-team-role-preview");
  if (preview) {
    preview.hidden = true;
    preview.innerHTML = "";
    preview.classList.remove("is-planned");
    preview.removeAttribute?.("data-planner-source");
  }
  const status = root?.querySelector?.("[data-terminal-team-status]");
  if (status) {
    status.textContent = "";
    status.classList.remove("is-visible");
  }
  setTerminalTeamPlanningUi(root, "idle");
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
  preview.hidden = false;
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

async function createTerminalTeam(plan, modelKey, options = {}) {
  const goal = normalizeTerminalTeamGoal(plan?.goal);
  const planId = normalizeTerminalTeamText(plan?.planId, 120);
  const rawTeamId = normalizeTerminalTeamText(plan?.teamId, 120) || planId;
  const teamId = typeof normalizeRendererTerminalTeamId === "function"
    ? normalizeRendererTerminalTeamId(rawTeamId)
    : rawTeamId;
  const assignments = Array.isArray(plan?.assignments) ? plan.assignments : [];
  if (!goal || !planId || !teamId || !assignments.length) return [];
  const created = assignments.map((assignment, index) => {
    const role = terminalTeamRoleCatalog[assignment.roleKey];
    if (!role) return null;
    return createTerminal(modelKey, false, {
      ...options,
      deferStart: true,
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
  if (created.length !== assignments.length) {
    rollbackLocalTerminalTeam(created);
    return [];
  }
  try {
    const requests = created.map((terminal) => ({
      id: terminal.id,
      title: terminal.title,
      agent: terminal.agent,
      model: terminal.model,
      reasoningEffort: terminal.effort,
      permissionMode: terminal.permissionMode,
      tokenMode: terminal.tokenMode,
      projectId: terminal.projectId,
      workspaceMode: terminal.workspaceMode,
      allowSharedFallback: terminal.workspaceMode === "worktree" && terminal.allowSharedFallback !== false,
      ...terminalTeamRequestFields(terminal, created),
      cols: terminal.cols || 100,
      rows: terminal.rows || 30,
      initialPrompt: terminal.initialPrompt,
      assignmentId: `team-${terminal.id}-${Date.now()}`
    }));
    const response = await fetch("/desktop/terminal-teams/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terminals: requests })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(result.sessions) || result.sessions.length !== created.length) {
      throw new Error(result.error || "The planned Team could not be launched.");
    }
    const sessions = new Map(result.sessions.map((session) => [String(session.id), session]));
    for (const terminal of created) {
      const session = sessions.get(terminal.id);
      if (!session) throw new Error("The bridge returned an incomplete Team.");
      Object.assign(terminal, ptySessionPatch(session), { pending: false });
      delete terminal.initialPrompt;
      if (terminal.ptyStatus !== "unavailable" && terminal.ptyStatus !== "exited") connectPtyTerminal(terminal);
    }
    saveTerminals();
    return created;
  } catch (error) {
    rollbackLocalTerminalTeam(created);
    throw error;
  }
}

function rollbackLocalTerminalTeam(created) {
  const ids = new Set(created.map((terminal) => terminal.id));
  for (const terminal of created) {
    if (typeof removeLocalPtyTerminal === "function") removeLocalPtyTerminal(terminal);
  }
  terminals = terminals.filter((terminal) => !ids.has(terminal.id));
  ensureTerminal();
  saveTerminals();
}
