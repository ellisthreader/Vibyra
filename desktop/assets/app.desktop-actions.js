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
  if (action.type === "run_terminal_tasks") return runTerminalTasksFromDesktopAction(action);
  if (action.type === "set_terminal_permissions") return setTerminalPermissionsFromDesktopAction(action);
  if (action.type === "close_terminals") return closeTerminalsFromDesktopAction(action);
  if (action.type === "open_terminal_companion") return openCompanionFromDesktopAction(action);
  throw new Error("Vibyra AI returned an unsupported desktop action.");
}

async function openTerminalsFromDesktopAction(action) {
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
  if (fullAccess && !isCodexDesktopActionModel(model)) {
    return "Full-access launches are currently supported only for Codex terminals.";
  }
  if (fullAccess && !window.confirm(`Open ${count} ${model.label} terminal${count === 1 ? "" : "s"} with full access? This bypasses approval and sandbox protections.`)) {
    return "Full-access terminal launch was cancelled.";
  }
  if (!count) {
    setPage("terminals");
    return `All ${maxTerminals} terminal slots are already in use.`;
  }

  const projectId = desktopActionProjectId(action);
  const workspaceMode = desktopActionWorkspaceMode(action, count, [projectId]);
  const options = {
    effort: desktopActionEffort(action.effort),
    permissionMode: fullAccess ? "full" : "standard",
    projectId,
    workspaceMode
  };
  setPage("terminals");
  createTerminals(count, model.key, options);
  const access = options.permissionMode === "full" ? " with full access" : "";
  const workspace = workspaceMode === "worktree" ? " on separate local Git branches" : "";
  const speed = options.effort === "low" ? " in fast mode" : "";
  const capacity = count < requested ? ` ${requested - count} could not open because the 12-terminal limit was reached.` : "";
  return `Opening ${count} ${model.label} terminal${count === 1 ? "" : "s"}${speed}${access}${workspace} in Terminals. Voice and Memory are available in the terminal toolbar.${capacity}`;
}

async function runTerminalTasksFromDesktopAction(action) {
  const tasks = (Array.isArray(action.tasks) ? action.tasks : [])
    .map((item) => desktopTerminalTask(item, action))
    .filter((item) => item.prompt);
  if (!tasks.length) return "No terminal tasks were provided.";
  if (action.target === "existing" || action.target === "existing_then_new") {
    return assignExistingTerminalTasks(tasks, action);
  }
  const available = Math.max(0, maxTerminals - terminals.length);
  const queued = tasks.slice(0, available);
  if (!queued.length) {
    setPage("terminals");
    return `All ${maxTerminals} terminal slots are already in use.`;
  }
  if (queued.some((task) => !task.model)) return "I could not match a terminal task model.";
  const locked = queued.find((task) => typeof modelLocked === "function" && modelLocked(task.model));
  if (locked) {
    openTokenModal("plans");
    return `${locked.model.label} is not available on the current Vibyra plan.`;
  }
  if (queued.some((task) => task.permissionMode === "full" && !isCodexDesktopActionModel(task.model))) {
    return "Full-access launches are currently supported only for Codex terminals.";
  }
  const fullAccessCount = queued.filter((task) => task.permissionMode === "full").length;
  if (fullAccessCount && !window.confirm(`Run ${fullAccessCount} terminal task${fullAccessCount === 1 ? "" : "s"} with full access? This bypasses approval and sandbox protections.`)) {
    return "Full-access terminal tasks were cancelled.";
  }

  const workspaceMode = desktopActionWorkspaceMode(action, queued.length, queued.map((task) => task.projectId));
  setPage("terminals");
  const launches = queued.map((task) => createTerminal(task.model.key, false, {
    effort: task.effort,
    initialPrompt: task.prompt,
    permissionMode: task.permissionMode,
    projectId: task.projectId,
    workspaceMode
  })).filter(Boolean);
  forceTerminalRender = true;
  render();
  const capacity = launches.length < tasks.length ? ` ${tasks.length - launches.length} could not start because the 12-terminal limit was reached.` : "";
  const workspace = workspaceMode === "worktree" ? " on separate local Git branches" : "";
  return `Starting ${launches.length} terminal task${launches.length === 1 ? "" : "s"}${workspace} in Terminals.${capacity}`;
}

async function assignExistingTerminalTasks(tasks, action) {
  if (typeof syncPtyTerminals === "function") await syncPtyTerminals();
  const hasProject = Object.prototype.hasOwnProperty.call(action || {}, "projectId");
  const projectId = hasProject ? String(action.projectId || "") : "";
  const eligible = terminals.filter((terminal) => {
    if (terminal.ptyStatus === "exited" || terminal.ptyStatus === "unavailable") return false;
    return !hasProject || String(terminal.projectId || "") === projectId;
  });
  const activeIndex = eligible.findIndex((terminal) => terminal.id === activeTerminalId);
  if (activeIndex > 0) eligible.unshift(eligible.splice(activeIndex, 1)[0]);
  const assignments = tasks.slice(0, eligible.length);
  if (!assignments.length && action.target !== "existing_then_new") {
    setPage("terminals");
    return hasProject
      ? "No running terminals are available in the selected project."
      : "No running terminals are available.";
  }

  setPage("terminals");
  const results = await Promise.all(assignments.map((task, index) =>
    sendExistingTerminalTask(eligible[index], task.prompt)
  ));
  const assigned = results.filter(Boolean).length;
  const failed = results.length - assigned;
  const remaining = action.target === "existing_then_new"
    ? tasks.slice(assignments.length)
    : [];
  const template = eligible[0] || null;
  const available = Math.max(0, maxTerminals - terminals.length);
  const additions = remaining.slice(0, available);
  const fullAccessCount = additions.filter((task) => task.permissionMode === "full").length;
  if (fullAccessCount && !window.confirm(`Open ${fullAccessCount} additional terminal${fullAccessCount === 1 ? "" : "s"} with the same full access? This bypasses approval and sandbox protections.`)) {
    return `Assigned ${assigned} terminal job${assigned === 1 ? "" : "s"} to the open terminals. Additional full-access terminals were cancelled.`;
  }
  const launched = additions.map((task) => {
    const terminal = createTerminal(template?.model || task.model?.key || "auto", false, {
      effort: template?.effort || task.effort,
      initialPrompt: task.prompt,
      permissionMode: task.permissionMode,
      projectId: template?.projectId ?? task.projectId,
      workspaceMode: template?.workspaceMode || "shared"
    });
    if (terminal && template?.tokenMode) terminal.tokenMode = template.tokenMode;
    return terminal;
  }).filter(Boolean);
  if (launched.length) {
    forceTerminalRender = true;
    saveTerminals();
    render();
  }
  const details = failed
    ? ` ${failed} assignment${failed === 1 ? "" : "s"} could not be delivered.`
    : "";
  const overflow = remaining.length - launched.length;
  const capacity = overflow
    ? ` ${overflow} task${overflow === 1 ? "" : "s"} could not start because the 12-terminal limit was reached.`
    : "";
  const started = launched.length
    ? ` Started ${launched.length} additional terminal job${launched.length === 1 ? "" : "s"}.`
    : "";
  return `Assigned ${assigned} terminal job${assigned === 1 ? "" : "s"} to the open terminals.${started}${details}${capacity}`;
}

async function sendExistingTerminalTask(terminal, prompt) {
  const preparedPrompt = typeof terminalTaskInputPrompt === "function"
    ? terminalTaskInputPrompt(terminal, prompt)
    : String(prompt || "");
  const safePrompt = String(preparedPrompt || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 8000);
  if (!safePrompt) return false;
  const input = `\x1b[200~${safePrompt.replace(/\r?\n/g, "\r")}\x1b[201~\r`;
  try {
    const response = await fetch(`/desktop/pty-terminals/${encodeURIComponent(terminal.id)}/input`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      terminal.notice = result.error || "The terminal job could not be delivered.";
      return false;
    }
    terminal.notice = null;
    return true;
  } catch {
    terminal.notice = "The terminal job could not be delivered.";
    return false;
  }
}

function desktopTerminalTask(item, action) {
  const source = item && typeof item === "object" ? item : { prompt: item };
  return {
    prompt: String(source.prompt || source.task || source.text || "").trim(),
    model: desktopActionModel(source.model || action.model),
    effort: desktopActionEffort(source.effort || action.effort),
    permissionMode: source.permissionMode === "full" || (!source.permissionMode && action.permissionMode === "full") ? "full" : "standard",
    projectId: desktopActionProjectId(source, action)
  };
}
function desktopActionProjectId(source, fallback = null) {
  if (Object.prototype.hasOwnProperty.call(source || {}, "projectId")) {
    return String(source.projectId || "");
  }
  if (Object.prototype.hasOwnProperty.call(fallback || {}, "projectId")) {
    return String(fallback.projectId || "");
  }
  return typeof terminalProjectForSetup === "function"
    ? String(terminalProjectForSetup() || "")
    : "";
}
function desktopActionWorkspaceMode(action, count, projectIds) {
  const requested = String(action?.workspaceMode || "").trim().toLowerCase();
  if (["worktree", "isolated"].includes(requested)) return "worktree";
  if (requested === "shared") return "shared";
  const projects = projectIds.map((id) => String(id || ""));
  if (count < 2 || projects.some((id) => !id || id === "full-pc")) return "shared";
  const isolate = window.confirm(
    "Use separate local Git branches for these terminals?\n\n"
    + "OK: isolate parallel edits in one worktree per terminal.\n"
    + "Cancel: use the shared project folder."
  );
  return isolate ? "worktree" : "shared";
}
function openCompanionFromDesktopAction(action) {
  const mode = action.mode === "voice" ? "voice" : action.mode === "memory" ? "memory" : "";
  if (!mode || typeof openTerminalCompanionPanel !== "function") return "";
  openTerminalCompanionPanel(mode, "chat");
  return `Opened Vibyra ${mode === "voice" ? "Voice" : "Memory"} beside the terminal workspace.`;
}
async function setTerminalPermissionsFromDesktopAction(action) {
  if (action.permissionMode !== "full") throw new Error("Vibyra AI returned an unsupported terminal permission mode.");
  if (typeof syncPtyTerminals === "function") await syncPtyTerminals();
  const targets = action.scope === "all"
    ? terminals.slice()
    : [findTerminal(String(action.terminalId || activeTerminalId || ""))].filter(Boolean);
  if (!targets.length) {
    setPage("terminals");
    return action.scope === "all" ? "No Vibyra Desktop terminals were open." : "There is no active terminal to update.";
  }
  const unavailable = targets.find((terminal) => {
    const model = desktopActionModel(terminal.model);
    return !model || (typeof modelLocked === "function" && modelLocked(model));
  });
  if (unavailable) {
    return "A terminal model is no longer available on the current plan, so no terminals were relaunched.";
  }
  const unsupported = targets.find((terminal) => {
    const model = desktopActionModel(terminal.model);
    return !isCodexDesktopActionModel(model || terminal.model);
  });
  if (unsupported) return "Full access is currently supported only for Codex terminals.";
  if (targets.every((terminal) => terminal.permissionMode === "full")) {
    return targets.length === 1 ? "That terminal already has full access." : "All open terminals already have full access.";
  }
  if (targets.some((terminal) => terminal.workspaceMode === "worktree")) {
    return "Isolated terminals cannot be relaunched with different permissions yet because their local Git branches must stay attached to the same workspace.";
  }
  const count = targets.length;
  if (!window.confirm(`Relaunch ${count} Codex terminal${count === 1 ? "" : "s"} with full access? This ends the current processes and bypasses approval and sandbox protections.`)) {
    return "Full-access terminal relaunch was cancelled.";
  }

  const snapshots = targets.map((terminal) => ({
    id: terminal.id,
    title: terminal.title,
    model: terminal.model,
    effort: terminal.effort,
    projectId: terminal.projectId,
    tokenMode: terminal.tokenMode
  }));
  const previousActiveId = activeTerminalId;
  await closeDesktopActionTargets(targets, action.scope);
  let nextActiveId = "";
  for (const snapshot of snapshots.slice().reverse()) {
    const terminal = createTerminal(snapshot.model, false, {
      effort: snapshot.effort,
      permissionMode: "full",
      projectId: snapshot.projectId
    });
    if (!terminal) continue;
    terminal.title = snapshot.title;
    terminal.tokenMode = snapshot.tokenMode;
    if (snapshot.id === previousActiveId) nextActiveId = terminal.id;
  }
  if (nextActiveId) activeTerminalId = nextActiveId;
  forceTerminalRender = true;
  saveTerminals();
  setPage("terminals");
  render();
  return `Relaunched ${count} Codex terminal${count === 1 ? "" : "s"} with full access.`;
}
async function closeDesktopActionTargets(targets, scope) {
  const ids = targets.map((terminal) => terminal.id);
  if (scope === "all") {
    const response = await fetch("/desktop/pty-terminals/close-all", { method: "POST" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Vibyra Desktop could not relaunch the terminals.");
  } else {
    const response = await fetch(`/desktop/pty-terminals/${encodeURIComponent(ids[0])}/close`, { method: "POST" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Vibyra Desktop could not relaunch the terminal.");
  }
  clearDesktopActionTerminals(ids, false);
}
async function closeTerminalsFromDesktopAction(action) {
  if (typeof syncPtyTerminals === "function") await syncPtyTerminals();
  const ids = action.scope === "all"
    ? terminals.map((terminal) => terminal.id)
    : [String(action.terminalId || activeTerminalId || "")].filter(Boolean);
  if (!ids.length) {
    setPage("terminals");
    return action.scope === "all" ? "No Vibyra Desktop terminals were open." : "There is no active terminal to close.";
  }
  const preservesWorktrees = terminals.some((terminal) => terminal.workspaceMode === "worktree")
    ? " Isolated Git branches and worktrees will be preserved."
    : "";
  const closePrompt = action.scope === "all"
    ? `Close all ${ids.length} terminal${ids.length === 1 ? "" : "s"}? This ends running agents and removes their saved terminal context.${preservesWorktrees}`
    : `Close the active terminal? This ends its running agent and removes its saved terminal context.${preservesWorktrees}`;
  if (!window.confirm(closePrompt)) {
    return action.scope === "all" ? "Close-all was cancelled." : "Terminal close was cancelled.";
  }

  const url = action.scope === "all"
    ? "/desktop/pty-terminals/close-all"
    : `/desktop/pty-terminals/${encodeURIComponent(ids[0])}/close`;
  const response = await fetch(url, { method: "POST" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Vibyra Desktop could not close the requested terminals.");
  if (action.scope !== "all" && result.closed === false) {
    if (typeof syncPtyTerminals === "function") await syncPtyTerminals();
    setPage("terminals");
    return "That terminal was already closed.";
  }
  clearDesktopActionTerminals(ids);
  setPage("terminals");
  const closed = action.scope === "all" ? Number(result.closed) || ids.length : 1;
  return `Closed ${closed} terminal${closed === 1 ? "" : "s"}.`;
}
function clearDesktopActionTerminals(ids, shouldRender = true) {
  const removed = new Set(ids);
  terminals.filter((terminal) => removed.has(terminal.id)).forEach((terminal) => {
    if (typeof removeLocalPtyTerminal === "function") removeLocalPtyTerminal(terminal);
  });
  terminals = terminals.filter((terminal) => !removed.has(terminal.id));
  if (!terminals.some((terminal) => terminal.id === activeTerminalId)) activeTerminalId = terminals[0]?.id || "";
  settingsTerminalId = "";
  forceTerminalRender = true;
  saveTerminals();
  if (shouldRender) render();
}
function desktopActionModel(value) {
  const key = String(value || "auto").trim().toLowerCase();
  const choices = typeof modelChoices === "function" ? modelChoices() : chatModels;
  return choices.find((model) => String(model.key || "").toLowerCase() === key)
    || choices.find((model) => String(model.label || "").toLowerCase() === key)
    || choices.find((model) => desktopActionModelAliases(model).includes(key))
    || null;
}
function desktopActionModelAliases(model) {
  const values = [model?.key, model?.modelKey, model?.label];
  return Array.from(new Set(values.flatMap((value) => {
    const normalized = normalizeDesktopActionModel(value);
    const tail = normalized.split("/").pop() || normalized;
    return [normalized, tail];
  }).filter(Boolean)));
}
function isCodexDesktopActionModel(modelOrKey) {
  const key = String(
    typeof modelOrKey === "string"
      ? modelOrKey
      : modelOrKey?.modelKey || modelOrKey?.key || ""
  ).trim();
  return Boolean(key) && !key.includes("/") && terminalProviderKeyForModel(modelOrKey) === "openai";
}
function normalizeDesktopActionModel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^openai\//, "openai/")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-");
}
function desktopActionEffort(value) {
  const effort = String(value || "medium").toLowerCase();
  return ["low", "medium", "high", "xhigh"].includes(effort) ? effort : "medium";
}
