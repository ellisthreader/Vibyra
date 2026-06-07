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
  if (action.type === "open_terminal_companion") return openCompanionFromDesktopAction(action);
  return "";
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
