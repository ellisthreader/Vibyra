async function runDesktopActions(actions) {
  if (!Array.isArray(actions) || !actions.length) return "";
  const summaries = [];
  for (const action of actions) {
    const summary = await runDesktopAction(action);
    if (summary) summaries.push(summary);
  }
  return summaries.join("\n");
}

async function runDesktopAction(action) {
  if (!action || typeof action !== "object") return "";
  if (action.type === "open_terminals") return openTerminalsFromDesktopAction(action);
  if (action.type === "run_agentic_terminal_job") return runAgenticTerminalJob(action);
  if (action.type === "open_terminal_companion") return openCompanionFromDesktopAction(action);
  return "";
}

function runAgenticTerminalJob(action) {
  const assignments = Array.isArray(action.assignments) ? action.assignments.slice(0, maxTerminals) : [];
  const available = Math.max(0, maxTerminals - terminals.length);
  if (!assignments.length) return "The agentic job did not include any terminal assignments.";
  if (assignments.length > available) {
    setPage("terminals");
    return `This job needs ${assignments.length} terminals, but only ${available} slots are available. Close terminals and run it again.`;
  }

  const model = desktopActionModel(action.model);
  if (!model) return "I could not match the agentic job model.";
  if (typeof modelLocked === "function" && modelLocked(model)) {
    openTokenModal("plans");
    return `${model.label} is not available on the current Vibyra plan.`;
  }

  const agent = desktopActionAgent(action.agent, model);
  const status = terminalAgents.find((item) => item.key === agent);
  if (!status || status.available === false) {
    setPage("terminals");
    return `${status?.label || agent} is not installed, so the agentic job could not start.`;
  }

  const permissionMode = action.permissionMode === "full" ? "full" : "standard";
  if (permissionMode === "full" && agent !== "codex") {
    return "Full-access agentic jobs are currently supported only with Codex.";
  }

  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const jobDir = `.vibyra-agent/jobs/${jobId}`;
  const options = {
    agent,
    effort: desktopActionEffort(action.effort),
    permissionMode,
    projectId: String(action.projectId || selectedProjectId || ""),
    jobId
  };

  setPage("terminals");
  for (const assignment of assignments) {
    const role = String(assignment?.role || "worker");
    createTerminal(model.key, false, {
      ...options,
      title: String(assignment?.title || role),
      jobRole: role,
      initialPrompt: String(assignment?.prompt || "").replaceAll("{{JOB_DIR}}", jobDir)
    });
  }
  terminalLayout = assignments.length > 4 ? "grid" : "focus";
  forceTerminalRender = true;
  render();

  const workers = assignments.filter((item) => item?.role === "worker").length;
  const access = permissionMode === "full" ? " with full access" : "";
  return `Started ${assignments.length} coordinated ${status.label} terminals${access}: one planner, ${workers} worker${workers === 1 ? "" : "s"}, and one reviewer.`;
}

function openTerminalsFromDesktopAction(action) {
  const requested = normalizeCount(action.count);
  const available = Math.max(0, maxTerminals - terminals.length);
  const count = Math.min(requested, available);
  const model = desktopActionModel(action.model);
  if (!model) return "I could not match that terminal model.";
  if (typeof modelLocked === "function" && modelLocked(model)) {
    openTokenModal("plans");
    return `${model.label} is not available on the current Vibyra plan.`;
  }
  const fullAccess = action.permissionMode === "full";
  if (fullAccess && terminalProviderKeyForModel(model) !== "openai") {
    return "Full-access launches are currently supported only for Codex terminals.";
  }
  if (!count) {
    setPage("terminals");
    return `All ${maxTerminals} terminal slots are already in use.`;
  }

  const options = {
    effort: desktopActionEffort(action.effort),
    permissionMode: fullAccess ? "full" : "standard",
    projectId: String(action.projectId || selectedProjectId || "")
  };
  setPage("terminals");
  createTerminals(count, model.key, options);
  const access = options.permissionMode === "full" ? " with full access" : "";
  const speed = options.effort === "low" ? " in fast mode" : "";
  const capacity = count < requested ? ` ${requested - count} could not open because the 12-terminal limit was reached.` : "";
  return `Opened ${count} ${model.label} terminal${count === 1 ? "" : "s"}${speed}${access}. Voice and Memory are available in the terminal toolbar.${capacity}`;
}

function openCompanionFromDesktopAction(action) {
  const mode = action.mode === "voice" ? "voice" : action.mode === "memory" ? "memory" : "";
  if (!mode || typeof openTerminalCompanionPanel !== "function") return "";
  openTerminalCompanionPanel(mode, "chat");
  return `Opened Vibyra ${mode === "voice" ? "Voice" : "Memory"} beside the terminal workspace.`;
}

function desktopActionModel(value) {
  const key = String(value || "auto").trim().toLowerCase();
  const choices = typeof modelChoices === "function" ? modelChoices() : chatModels;
  return choices.find((model) => String(model.key || "").toLowerCase() === key)
    || choices.find((model) => String(model.label || "").toLowerCase() === key)
    || (key.includes("codex") ? choices.find((model) => String(model.key || "").includes("codex")) : null)
    || choices.find((model) => model.key === "auto")
    || choices[0]
    || null;
}

function desktopActionEffort(value) {
  const effort = String(value || "medium").toLowerCase();
  return ["low", "medium", "high", "xhigh"].includes(effort) ? effort : "medium";
}

function desktopActionAgent(value, model) {
  const requested = String(value || "").trim().toLowerCase();
  if (terminalAgents.some((item) => item.key === requested)) return requested;
  const provider = terminalProviderKeyForModel(model);
  if (provider === "claude") return "claude";
  if (provider === "gemini") return "gemini";
  return "codex";
}
