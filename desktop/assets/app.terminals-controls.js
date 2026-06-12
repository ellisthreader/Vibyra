function bindTerminalControls() {
  const root = nodes?.content || document;
  bindCustomSelects(root);
  root.querySelectorAll("[data-terminal-setup-mode]").forEach((button) => button.addEventListener("click", () => {
    selectTerminalSetupMode(button.dataset.terminalSetupMode);
  }));
  root.querySelectorAll("[data-terminal-setup-go]").forEach((button) => button.addEventListener("click", () => {
    const step = button.dataset.terminalSetupGo;
    if (!["mode", "setup"].includes(step)) return;
    terminalSetupStep = step;
    setupModelMenuOpen = false;
    terminalProjectMenuTarget = "";
    render();
  }));
  root.querySelector("[data-terminal-advanced-toggle]")?.addEventListener("click", (event) => {
    terminalSetupAdvancedOpen = !terminalSetupAdvancedOpen;
    const disclosure = event.currentTarget.closest(".terminal-setup-advanced");
    disclosure?.classList.toggle("open", terminalSetupAdvancedOpen);
    event.currentTarget.setAttribute("aria-expanded", String(terminalSetupAdvancedOpen));
    disclosure?.querySelector(".terminal-setup-advanced-panel")
      ?.setAttribute("aria-hidden", String(!terminalSetupAdvancedOpen));
  });
  root.querySelector("[data-terminal-team-goal]")?.addEventListener("input", (event) => {
    setupTeamGoal = normalizeTerminalTeamGoal(event.target.value);
    terminalTeamPlanningError = "";
    const button = root.querySelector("#start-terminals");
    if (!button?.dataset.terminalTeamRequiresGoal) return;
    const ready = button.dataset.terminalLaunchReady === "true";
    button.disabled = !ready || !setupTeamGoal;
    const label = button.querySelector("svg")?.outerHTML || icon("arrow");
    button.innerHTML = `${label}${escapeHtml(setupTeamGoal ? "Plan and start team" : "Describe the team goal")}`;
  });
  const teamLaunchButton = root.querySelector("#start-terminals[data-terminal-team-requires-goal]");
  if (teamLaunchButton && setupTeamGoal && !teamLaunchButton.dataset.terminalLaunchBusy) {
    teamLaunchButton.innerHTML = `${teamLaunchButton.querySelector("svg")?.outerHTML || icon("arrow")}Plan and start team`;
  }
  bindTerminalClick(root.querySelector("#open-terminal-new"), () => { newTerminalMenuOpen = !newTerminalMenuOpen; if (newTerminalMenuOpen) modelScrollTops.new = 0; else terminalProjectMenuTarget = ""; settingsTerminalId = ""; render(); });
  bindTerminalClick(root.querySelector("#open-terminal-toolbar"), (event) => {
    event.stopPropagation();
    terminalToolbarMenuOpen = !terminalToolbarMenuOpen;
    newTerminalMenuOpen = false;
    terminalProjectMenuTarget = "";
    settingsTerminalId = "";
    render();
  });
  bindTerminalClick(root.querySelector("#toggle-terminal-layout"), () => { terminalLayout = terminalLayout === "grid" ? "focus" : "grid"; saveTerminals(); render(); });
  root.querySelector("#start-terminals")?.addEventListener("click", async (event) => {
    if (typeof terminalProjectReadyForSetup === "function" && !terminalProjectReadyForSetup()) return;
    const model = selectedSetupModel();
    setupTokenMode = typeof terminalTokenModeForModel === "function"
      ? terminalTokenModeForModel(model, setupTokenMode)
      : setupTokenMode;
    localStorage.setItem("vibyra.desktop.terminalTokenMode", setupTokenMode);
    const sourceIssue = typeof terminalTokenSourceIssue === "function"
      ? terminalTokenSourceIssue(model, setupTokenMode)
      : "";
    if (sourceIssue) {
      providerConnectNotice = sourceIssue;
      render();
      return;
    }
    const runtimeIssue = typeof terminalRuntimeLaunchIssue === "function"
      ? terminalRuntimeLaunchIssue(model, setupTokenMode)
      : "";
    if (runtimeIssue) {
      terminalRuntimeNotice = runtimeIssue;
      render();
      return;
    }
    const button = event.currentTarget;
    if (button?.dataset.terminalLaunchBusy) return;
    const teamMode = terminalSetupMode === "team";
    const teamGoal = teamMode ? normalizeTerminalTeamGoal(setupTeamGoal) : "";
    if (teamMode && !teamGoal) return;
    const available = terminalBatchSetupOpen ? terminalBatchAvailableSlots() : maxTerminals;
    let count = teamMode
      ? 0
      : Math.min(available, normalizeCount(root.querySelector("[data-terminal-custom-count]")?.value || setupCount));
    if (!teamMode && count < 1) return;
    let teamPlan = null;
    let teamRequestId = 0;
    if (teamMode) {
      teamRequestId = ++terminalTeamPlanRequest;
      terminalTeamPlanController?.abort();
      terminalTeamPlanController = new AbortController();
      button.dataset.terminalLaunchBusy = "1";
      button.disabled = true;
      setTerminalTeamPlanningUi(root, "planning");
      startTerminalTeamPlanningPhases(root);
      try {
        teamPlan = await requestTerminalTeamPlan({
          goal: teamGoal,
          teamSize: setupTeamSize,
          projectId: setupProjectId,
          model: setupModel,
          tokenMode: setupTokenMode
        }, {
          signal: terminalTeamPlanController.signal,
          onPhase: (phase) => setTerminalTeamPlanningPhase(root, phase)
        });
        if (teamRequestId !== terminalTeamPlanRequest) return;
        terminalTeamPlanController = null;
        setTerminalTeamPlanningPhase(root, "preparing");
        previewTerminalTeamPlan(root, teamPlan);
        await revealTerminalTeamPlan();
        if (teamRequestId !== terminalTeamPlanRequest) return;
        setTerminalTeamPlanningUi(root, "planned");
        button.innerHTML = `${icon("check")}Team ready`;
      } catch (error) {
        if (teamRequestId !== terminalTeamPlanRequest) return;
        stopTerminalTeamPlanningPhases();
        terminalTeamPlanController = null;
        delete button.dataset.terminalLaunchBusy;
        button.disabled = false;
        button.innerHTML = `${icon("arrow")}Plan and start team`;
        setTerminalTeamPlanningUi(root, "error", error instanceof Error ? error.message : "Vibyra could not plan this team.");
        return;
      }
      count = teamPlan.teamSize;
      if (count > available) {
        delete button.dataset.terminalLaunchBusy;
        button.disabled = false;
        button.innerHTML = `${icon("arrow")}Plan and start team`;
        setTerminalTeamPlanningUi(root, "error", "The planned Team needs more available terminal slots.");
        return;
      }
    }
    const workspaceMode = count > 1 && setupProjectId && setupProjectId !== "full-pc"
      ? setupWorkspaceMode
      : "shared";
    if (workspaceMode === "worktree" && typeof prepareTerminalWorkspaceLaunch === "function") {
      button.dataset.terminalLaunchBusy = "1";
      button.disabled = true;
      const original = button.innerHTML;
      button.textContent = "Checking project...";
      let ready = false;
      try {
        ready = await prepareTerminalWorkspaceLaunch(terminalProjectForSetup());
      } finally {
        if (!teamMode) {
          delete button.dataset.terminalLaunchBusy;
          button.disabled = false;
          button.innerHTML = original;
        }
      }
      if (teamMode && teamRequestId !== terminalTeamPlanRequest) return;
      if (!ready) {
        if (teamMode) {
          delete button.dataset.terminalLaunchBusy;
          button.disabled = false;
          button.innerHTML = `${icon("arrow")}Plan and start team`;
          setTerminalTeamPlanningUi(root, "error", "The project workspace could not be prepared.");
        }
        return;
      }
    }
    const launchOptions = {
      effort: terminalEffortForModel(selectedSetupModel(), setupEffort),
      permissionMode: terminalPermissionModeForSetup(selectedSetupModel(), setupTokenMode),
      tokenMode: setupTokenMode,
      workspaceMode,
      allowSharedFallback: workspaceMode !== "worktree"
    };
    if (teamMode) {
      let created = [];
      try {
        created = await createTerminalTeam(teamPlan, setupModel, launchOptions);
      } catch (error) {
        delete button.dataset.terminalLaunchBusy;
        button.disabled = false;
        button.innerHTML = `${icon("arrow")}Plan and start team`;
        setTerminalTeamPlanningUi(root, "error", error instanceof Error ? error.message : "The planned Team could not be launched.");
        return;
      }
      if (created.length !== teamPlan.teamSize) {
        delete button.dataset.terminalLaunchBusy;
        button.disabled = false;
        button.innerHTML = `${icon("arrow")}Plan and start team`;
        setTerminalTeamPlanningUi(root, "error", "The planned Team could not be launched.");
        return;
      }
      if (terminalBatchSetupOpen) completeTerminalBatchSetup();
      resetTerminalSetupFlow();
      forceTerminalRender = true;
      render();
    } else {
      if (terminalBatchSetupOpen) completeTerminalBatchSetup();
      createTerminals(count, setupModel, launchOptions);
    }
  });
  root.querySelector("[data-terminal-team-cancel]")?.addEventListener("click", () => {
    if (terminalTeamPlanning || root.querySelector("#start-terminals")?.dataset.terminalLaunchBusy) {
      cancelTerminalTeamPlanning(root);
      return;
    }
    if (terminalBatchSetupOpen) {
      closeTerminalBatchSetup();
      return;
    }
    terminalSetupStep = "mode";
    resetTerminalTeamSetup();
    render();
  });
  root.querySelector("[data-terminal-batch-cancel]")?.addEventListener("click", () => closeTerminalBatchSetup());
  root.querySelectorAll("[data-terminal-count]").forEach((button) => button.addEventListener("click", () => {
    const count = normalizeCount(button.dataset.terminalCount);
    const capacity = terminalBatchSetupOpen ? terminalBatchAvailableSlots() : maxTerminals;
    setupCount = Math.min(count, capacity);
    render();
  }));
  root.querySelectorAll("[data-terminal-team-size]").forEach((button) => button.addEventListener("click", () => {
    const requested = Number(button.dataset.terminalTeamSize);
    const capacity = terminalBatchSetupOpen ? terminalBatchAvailableSlots() : maxTerminals;
    setupTeamSize = [2, 3, 4].includes(requested) && requested <= capacity
      ? requested
      : 0;
    render();
  }));
  root.querySelectorAll("[data-terminal-setup-effort]").forEach((button) => button.addEventListener("click", () => {
    setupEffort = terminalEffortForModel(selectedSetupModel(), button.dataset.terminalSetupEffort);
    localStorage.setItem(setupEffortKey, setupEffort);
    render();
  }));
  root.querySelector("[data-terminal-custom-count]")?.addEventListener("change", (event) => {
    const capacity = terminalBatchSetupOpen ? terminalBatchAvailableSlots() : maxTerminals;
    setupCount = Math.min(normalizeCount(event.target.value), capacity);
    render();
  });
  root.querySelectorAll("[data-terminal-workspace-mode]").forEach((button) => button.addEventListener("click", () => {
    setupWorkspaceMode = normalizeTerminalWorkspaceMode(button.dataset.terminalWorkspaceMode);
    localStorage.setItem(setupWorkspaceModeKey, setupWorkspaceMode);
    render();
  }));
  root.querySelectorAll("[data-terminal-permission-mode]").forEach((button) => button.addEventListener("click", () => {
    const requested = normalizeTerminalPermissionMode(button.dataset.terminalPermissionMode);
    setupPermissionMode = terminalPermissionModeForSetup(selectedSetupModel(), setupTokenMode, requested);
    localStorage.setItem(setupPermissionModeKey, setupPermissionMode);
    render();
  }));
  if (typeof bindTerminalProjectControls === "function") bindTerminalProjectControls(root);
  root.querySelector("[data-terminal-setup-model-toggle]")?.addEventListener("click", () => { setupModelMenuOpen = !setupModelMenuOpen; if (setupModelMenuOpen) { modelScrollTops.setup = 0; terminalProjectMenuTarget = ""; } render(); });
  root.querySelectorAll("[data-terminal-model-search]").forEach((input) => input.addEventListener("input", () => updateTerminalModelSearch(input)));
  root.querySelectorAll(".terminal-model-scroll").forEach(bindTerminalModelScroll);
  root.querySelectorAll("[data-terminal-setup-model]").forEach((button) => button.addEventListener("click", () => selectSetupModel(button.dataset.terminalSetupModel || "auto")));
  root.querySelectorAll("[data-terminal-new-model]").forEach((button) => bindTerminalClick(button, () => createTerminalFromModel(button.dataset.terminalNewModel || "auto")));
  root.querySelectorAll("[data-terminal-focus]").forEach((button) => bindTerminalClick(button, () => setActiveTerminal(button.dataset.terminalFocus)));
  if (typeof bindTerminalProjectGroupControls === "function") bindTerminalProjectGroupControls(root);
  root.querySelectorAll("[data-terminal-drag]").forEach((tab) => bindTerminalDrag(tab));
  root.querySelectorAll("[data-terminal-settings]").forEach((button) => bindTerminalClick(button, () => toggleTerminalSettings(button.dataset.terminalSettings)));
  if (typeof bindTerminalFullscreenControls === "function") bindTerminalFullscreenControls(root);
  root.querySelectorAll("[data-terminal-close]").forEach((button) => bindTerminalClick(button, (event) => {
    event.preventDefault();
    event.stopPropagation();
    (typeof requestCloseTerminal === "function" ? requestCloseTerminal : closeTerminal)(button.dataset.terminalClose);
  }));
  root.querySelectorAll("[data-terminal-close-all]").forEach((button) => bindTerminalClick(button, () => {
    if (typeof requestCloseAllPtyTerminals === "function") void requestCloseAllPtyTerminals();
  }));
  bindTerminalNoticeControls(root);
  if (typeof bindTerminalWorkspaceCheckpointLinks === "function") bindTerminalWorkspaceCheckpointLinks(root);
  root.querySelectorAll("[data-terminal-field]").forEach((field) => field.addEventListener("change", () => updateField(field)));
  bindTerminalRenameControls(root);
  bindTerminalTokenControls(root);
  if (typeof bindTerminalRuntimeControls === "function") bindTerminalRuntimeControls(root);
  if (typeof bindTerminalProjectWorkspaceControls === "function") bindTerminalProjectWorkspaceControls(root);
  root.querySelectorAll("[data-terminal-draft]").forEach((field) => {
    fitTerminalDraft(field);
    field.addEventListener("keydown", (event) => handleTerminalDraftKeydown(event, field));
    field.addEventListener("input", () => updateDraft(field));
  });
  root.querySelectorAll("[data-terminal-form]").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); sendTerminal(form.dataset.terminalForm); }));
  bindTerminalCommandButtons(root);
  if (typeof scheduleTerminalLayoutSync === "function") scheduleTerminalLayoutSync();
}

function bindTerminalClick(node, handler) {
  if (!node || node.dataset.terminalClickBound) return;
  node.dataset.terminalClickBound = "1";
  node.addEventListener("click", handler);
}

function bindTerminalNoticeControls(root = document) {
  root.querySelectorAll?.("[data-terminal-notice]").forEach((button) => bindTerminalClick(button, (event) => {
    event.preventDefault();
    event.stopPropagation();
    const terminal = findTerminal(button.dataset.terminalNotice);
    if (!terminal) return;
    terminal.notice = null;
    terminal.updatedAt = Date.now();
    saveTerminals();
    const article = button.closest("[data-terminal]");
    button.closest(".terminal-notice")?.remove();
    article?.classList.remove("has-notice");
  }));
}

function updateField(field) {
  if (field.dataset.terminalField === "model") {
    const model = (config().chatModels || []).find((item) => item.key === field.value);
    const terminal = findTerminal(field.dataset.terminalId);
    if (typeof terminalModelLocked === "function" && terminalModelLocked(model, terminal?.tokenMode)) { openTokenModal("plans"); render(); return; }
  }
  updateTerminal(field.dataset.terminalId, { [field.dataset.terminalField]: field.value });
}

function bindTerminalRenameControls(root = document) {
  root.querySelectorAll?.("[data-terminal-rename-form]").forEach((form) => {
    if (form.dataset.terminalRenameBound) return;
    form.dataset.terminalRenameBound = "1";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const id = form.dataset.terminalRenameForm || "";
      const input = form.querySelector("[data-terminal-rename-input]");
      const status = form.querySelector("[data-terminal-rename-status]");
      const title = String(input?.value || "").replace(/\s+/g, " ").trim().slice(0, 72);
      if (!title) {
        if (status) status.textContent = "Enter a terminal name.";
        input?.focus();
        return;
      }
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      if (status) status.textContent = "Saving...";
      try {
        const response = await fetch(`/desktop/pty-terminals/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.session) throw new Error(result.error || "The terminal name could not be saved.");
        const terminal = findTerminal(id);
        if (terminal) terminal.title = String(result.session.title || title);
        settingsTerminalId = "";
        saveTerminals();
        renderTopbar();
        if (!refreshPtyTerminalsDom()) {
          forceTerminalRender = true;
          render();
        }
      } catch (error) {
        if (status) status.textContent = error instanceof Error ? error.message : "The terminal name could not be saved.";
        if (button) button.disabled = false;
      }
    });
  });
}

function updateDraft(field) {
  const terminal = findTerminal(field.dataset.terminalDraft);
  if (!terminal) return;
  terminal.draft = field.value;
  terminal.updatedAt = Date.now();
  saveTerminals();
  fitTerminalDraft(field);
  updateTerminalCommandPalette(field, terminal);
}

function handleTerminalDraftKeydown(event, field) {
  const terminal = findTerminal(field.dataset.terminalDraft);
  if (!terminal) return;
  const options = terminalCommandOptions(terminal, field.value);
  if (!options.length) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendTerminal(terminal.id);
    }
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    terminalCommandIndexes[terminal.id] = (terminalCommandIndexes[terminal.id] + delta + options.length) % options.length;
    updateTerminalCommandPalette(field, terminal);
    return;
  }
  if (event.key === "Enter" || event.key === "Tab") {
    event.preventDefault();
    pickTerminalCommand(terminal.id, options[terminalCommandIndexes[terminal.id] || 0]?.command || options[0].command, field);
    return;
  }
  if (event.key === "Escape") {
    terminalCommandIndexes[terminal.id] = 0;
    field.value = "";
    updateDraft(field);
  }
}

function bindTerminalCommandButtons(root) {
  root.querySelectorAll?.("[data-terminal-command-pick]").forEach((button) => {
    if (button.dataset.terminalCommandBound) return;
    button.dataset.terminalCommandBound = "1";
    button.addEventListener("click", () => pickTerminalCommand(button.dataset.terminalId, button.dataset.terminalCommandPick));
  });
}

function pickTerminalCommand(id, command, field = null) {
  const terminal = findTerminal(id);
  if (!terminal || !command) return;
  terminal.draft = `${command} `;
  terminalCommandIndexes[terminal.id] = 0;
  saveTerminals();
  const target = field || Array.from((nodes?.content || document).querySelectorAll("[data-terminal-draft]")).find((item) => item.dataset.terminalDraft === terminal.id);
  if (target) {
    target.value = terminal.draft;
    target.focus();
    target.setSelectionRange?.(target.value.length, target.value.length);
    fitTerminalDraft(target);
    updateTerminalCommandPalette(target, terminal);
  }
}

function updateTerminalCommandPalette(field, terminal) {
  const wrap = field.closest(".terminal-composer-wrap");
  if (!wrap) return;
  const current = wrap.querySelector(".terminal-command-menu");
  const html = terminalCommandPalette(terminal);
  if (!html) { current?.remove(); return; }
  if (current) current.outerHTML = html;
  else wrap.insertAdjacentHTML("beforeend", html);
  bindTerminalCommandButtons(wrap);
}

function fitTerminalDraft(field) {
  const focusMode = Boolean(field.closest(".terminal-focus"));
  const maxHeight = focusMode ? 168 : 112;
  const minHeight = focusMode ? 46 : 38;
  field.style.height = "auto";
  const nextHeight = Math.min(maxHeight, Math.max(minHeight, field.scrollHeight));
  field.style.height = String(nextHeight) + "px";
  field.style.overflowY = field.scrollHeight > maxHeight ? "auto" : "hidden";
}

function focusedTerminalDraft() {
  const field = document.activeElement;
  if (!field?.matches?.("[data-terminal-draft]")) return null;
  return { field, id: field.dataset.terminalDraft || "" };
}

function renderedTerminalDraft(id) {
  return Array.from(nodes.content.querySelectorAll("[data-terminal-draft]")).some((field) => field.dataset.terminalDraft === id);
}

function toggleTerminalSettings(id) {
  settingsTerminalId = settingsTerminalId === id ? "" : id;
  newTerminalMenuOpen = false;
  render();
}

function setActiveTerminal(id) {
  activeTerminalId = id;
  const terminal = findTerminal(id);
  if (typeof activateTerminalProjectForTerminal === "function") activateTerminalProjectForTerminal(terminal);
  if (typeof rememberActiveTerminalForProject === "function") rememberActiveTerminalForProject(terminal);
  settingsTerminalId = "";
  forceTerminalRender = true;
  saveTerminals();
  render();
}

function bindTerminalDrag(tab) {
  tab.querySelector("[data-terminal-focus]")?.addEventListener("keydown", (event) => {
    if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const id = tab.dataset.terminalDrag || "";
    const index = terminals.findIndex((terminal) => terminal.id === id);
    const target = event.key === "ArrowLeft" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= terminals.length) return;
    moveTerminal(id, terminals[target].id);
    requestAnimationFrame(() => document.querySelector(`[data-terminal-focus="${CSS.escape(id)}"]`)?.focus());
  });
  tab.addEventListener("dragstart", (event) => {
    if (event.target?.closest?.("button")) {
      event.preventDefault();
      return;
    }
    event.dataTransfer?.setData("text/plain", tab.dataset.terminalDrag || "");
    event.dataTransfer?.setDragImage(tab, Math.floor(tab.offsetWidth / 2), Math.floor(tab.offsetHeight / 2));
    tab.classList.add("dragging");
  });
  tab.addEventListener("dragover", (event) => {
    event.preventDefault();
    tab.classList.add("drag-over");
  });
  tab.addEventListener("dragleave", () => tab.classList.remove("drag-over"));
  tab.addEventListener("dragend", () => document.querySelectorAll("[data-terminal-drag]").forEach((item) => item.classList.remove("dragging", "drag-over")));
  tab.addEventListener("drop", (event) => {
    event.preventDefault();
    const fromId = event.dataTransfer?.getData("text/plain") || "";
    moveTerminal(fromId, tab.dataset.terminalDrag || "");
  });
}

function bindTerminalModelScroll(scroller) {
  const target = terminalModelPickerTarget(scroller);
  restoreTerminalModelScroll(scroller, target);
  scroller.addEventListener("scroll", () => {
    const nextTarget = terminalModelPickerTarget(scroller);
    if (nextTarget) modelScrollTops[nextTarget] = scroller.scrollTop;
  }, { passive: true });
}

function focusedTerminalModelSearch() {
  const input = document.activeElement;
  if (!input?.matches?.("[data-terminal-model-search]")) return null;
  const target = input.dataset.terminalModelSearch || "";
  if (target !== "new" && target !== "setup") return null;
  return { input, target };
}

function captureTerminalModelScrolls(root = document) {
  root.querySelectorAll?.(".terminal-model-scroll").forEach((scroller) => {
    const target = terminalModelPickerTarget(scroller);
    if (target) modelScrollTops[target] = scroller.scrollTop;
  });
}

function restoreTerminalModelScroll(scroller, target = terminalModelPickerTarget(scroller)) {
  if (!target) return;
  const top = modelScrollTops[target] || 0;
  scroller.scrollTop = top;
  requestAnimationFrame(() => { scroller.scrollTop = top; });
}

function terminalModelPickerTarget(scroller) {
  const value = scroller.closest("[data-terminal-model-picker]")?.dataset.terminalModelPicker;
  return value === "new" || value === "setup" ? value : "";
}

function moveTerminal(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return;
  const fromIndex = terminals.findIndex((terminal) => terminal.id === fromId);
  const toIndex = terminals.findIndex((terminal) => terminal.id === toId);
  if (fromIndex < 0 || toIndex < 0) return;
  const [terminal] = terminals.splice(fromIndex, 1);
  terminals.splice(toIndex, 0, terminal);
  forceTerminalRender = true;
  saveTerminals();
  render();
}

function closeTerminal(id) {
  const closing = findTerminal(id);
  const closingProjectKey = typeof terminalProjectGroupKey === "function"
    ? terminalProjectGroupKey(closing)
    : "";
  terminals = terminals.filter((terminal) => terminal.id !== id);
  if (typeof fullscreenTerminalId === "string" && fullscreenTerminalId === id) {
    fullscreenTerminalId = "";
    localStorage.removeItem(terminalFullscreenKey);
  }
  if (!terminals.length) activeTerminalId = "";
  else if (activeTerminalId === id) {
    const sameProject = closingProjectKey && typeof terminalProjectGroupKey === "function"
      ? terminals.find((terminal) => terminalProjectGroupKey(terminal) === closingProjectKey)
      : null;
    activeTerminalId = sameProject?.id || terminals[0]?.id || "";
  }
  if (activeTerminalId && typeof rememberActiveTerminalForProject === "function") {
    rememberActiveTerminalForProject(findTerminal(activeTerminalId));
  }
  settingsTerminalId = "";
  forceTerminalRender = true;
  saveTerminals();
  render();
}

function updateTerminal(id, patch) {
  const terminal = findTerminal(id);
  if (!terminal) return;
  Object.assign(terminal, patch, { updatedAt: Date.now() });
  forceTerminalRender = true;
  saveTerminals();
  render();
}

function bindTerminalTokenControls(root) {
  root.querySelectorAll?.("[data-terminal-token-mode]").forEach((button) => {
    if (button.dataset.tokenModeBound) return;
    button.dataset.tokenModeBound = "1";
    button.addEventListener("click", () => setTerminalTokenMode(button.dataset.terminalTokenTarget || "setup", button.dataset.terminalTokenMode));
  });
  root.querySelectorAll?.("[data-open-ai-accounts]").forEach((button) => {
    if (button.dataset.aiAccountsBound) return;
    button.dataset.aiAccountsBound = "1";
    button.addEventListener("click", () => {
      if (typeof openAiAccountsSettings === "function") openAiAccountsSettings(button);
    });
  });
}

function setTerminalTokenMode(target, mode) {
  const next = ["vibyra", "provider"].includes(mode) ? mode : "vibyra";
  const model = target === "setup"
    ? (typeof selectedSetupModel === "function" ? selectedSetupModel() : null)
    : (typeof terminalModelForDisplay === "function" ? terminalModelForDisplay(findTerminal(target)?.model) : null);
  if (target === "setup") {
    setupTokenMode = typeof terminalTokenModeForModel === "function" ? terminalTokenModeForModel(model, next) : next;
    if (setupTokenMode !== "vibyra" && typeof terminalModelAvailableForTokenMode === "function" && !terminalModelAvailableForTokenMode(model, setupTokenMode)) {
      providerConnectNotice = "Connect this provider in Settings before using My AI accounts.";
    } else {
      providerConnectNotice = "";
    }
    localStorage.setItem("vibyra.desktop.terminalTokenMode", setupTokenMode);
    render();
    return;
  }
  const terminal = findTerminal(target);
  if (!terminal) return;
  updateTerminal(target, { tokenMode: typeof terminalTokenModeForModel === "function" ? terminalTokenModeForModel(model, next) : next });
}
