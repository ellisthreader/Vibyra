function bindTerminalControls() {
  document.getElementById("open-terminal-new")?.addEventListener("click", () => { newTerminalMenuOpen = !newTerminalMenuOpen; if (newTerminalMenuOpen) modelScrollTops.new = 0; settingsTerminalId = ""; render(); });
  document.getElementById("toggle-terminal-layout")?.addEventListener("click", () => { terminalLayout = terminalLayout === "grid" ? "focus" : "grid"; saveTerminals(); render(); });
  document.getElementById("start-terminals")?.addEventListener("click", () => createTerminals(document.querySelector("[data-terminal-custom-count]")?.value || setupCount, setupModel));
  document.querySelectorAll("[data-terminal-count]").forEach((button) => button.addEventListener("click", () => { setupCount = normalizeCount(button.dataset.terminalCount); render(); }));
  document.querySelector("[data-terminal-custom-count]")?.addEventListener("change", (event) => { setupCount = normalizeCount(event.target.value); render(); });
  document.querySelector("[data-terminal-setup-model-toggle]")?.addEventListener("click", () => { setupModelMenuOpen = !setupModelMenuOpen; if (setupModelMenuOpen) modelScrollTops.setup = 0; render(); });
  document.querySelectorAll("[data-terminal-model-search]").forEach((input) => input.addEventListener("input", () => updateTerminalModelSearch(input)));
  document.querySelectorAll(".terminal-model-scroll").forEach(bindTerminalModelScroll);
  document.querySelectorAll("[data-terminal-setup-model]").forEach((button) => button.addEventListener("click", () => selectSetupModel(button.dataset.terminalSetupModel || "auto")));
  document.querySelectorAll("[data-terminal-new-model]").forEach((button) => button.addEventListener("click", () => createTerminalFromModel(button.dataset.terminalNewModel || "auto")));
  document.querySelectorAll("[data-terminal-focus]").forEach((button) => button.addEventListener("click", () => setActiveTerminal(button.dataset.terminalFocus)));
  document.querySelectorAll("[data-terminal-drag]").forEach((tab) => bindTerminalDrag(tab));
  document.querySelectorAll("[data-terminal-settings]").forEach((button) => button.addEventListener("click", () => toggleTerminalSettings(button.dataset.terminalSettings)));
  document.querySelectorAll("[data-terminal-close]").forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeTerminal(button.dataset.terminalClose);
  }));
  document.querySelectorAll("[data-terminal-notice]").forEach((button) => button.addEventListener("click", () => updateTerminal(button.dataset.terminalNotice, { notice: null })));
  document.querySelectorAll("[data-terminal-field]").forEach((field) => field.addEventListener("change", () => updateField(field)));
  bindTerminalTokenControls(document);
  document.querySelectorAll("[data-terminal-draft]").forEach((field) => {
    fitTerminalDraft(field);
    field.addEventListener("keydown", (event) => handleTerminalDraftKeydown(event, field));
    field.addEventListener("input", () => updateDraft(field));
  });
  document.querySelectorAll("[data-terminal-form]").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); sendTerminal(form.dataset.terminalForm); }));
  bindTerminalCommandButtons(document);
}

function updateField(field) {
  if (field.dataset.terminalField === "model") {
    const model = (config().chatModels || []).find((item) => item.key === field.value);
    if (typeof modelLocked === "function" && modelLocked(model)) { openTokenModal("plans"); render(); return; }
  }
  updateTerminal(field.dataset.terminalId, { [field.dataset.terminalField]: field.value });
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
  const target = field || Array.from(document.querySelectorAll("[data-terminal-draft]")).find((item) => item.dataset.terminalDraft === terminal.id);
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
  settingsTerminalId = "";
  forceTerminalRender = true;
  saveTerminals();
  render();
}

function bindTerminalDrag(tab) {
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
  tab.addEventListener("dragend", () => document.querySelectorAll(".terminal-tab").forEach((item) => item.classList.remove("dragging", "drag-over")));
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
  terminals = terminals.filter((terminal) => terminal.id !== id);
  if (!terminals.length) activeTerminalId = "";
  else if (activeTerminalId === id) activeTerminalId = terminals[0]?.id || "";
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
  root.querySelectorAll?.("[data-open-provider-connect]").forEach((button) => {
    if (button.dataset.providerConnectBound) return;
    button.dataset.providerConnectBound = "1";
    button.addEventListener("click", () => {
      providerConnectOpen = !providerConnectOpen;
      providerConnectNotice = "";
      render();
    });
  });
  root.querySelectorAll?.("[data-provider-disconnect]").forEach((button) => {
    if (button.dataset.providerDisconnectBound) return;
    button.dataset.providerDisconnectBound = "1";
    button.addEventListener("click", () => disconnectOpenAiProvider());
  });
  root.querySelectorAll?.("[data-provider-connect-form]").forEach((form) => {
    if (form.dataset.providerFormBound) return;
    form.dataset.providerFormBound = "1";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      connectOpenAiProvider(form);
    });
  });
}

function setTerminalTokenMode(target, mode) {
  const next = mode === "provider" ? "provider" : "vibyra";
  if (target === "setup") {
    const model = typeof selectedSetupModel === "function" ? selectedSetupModel() : null;
    setupTokenMode = typeof terminalTokenModeForModel === "function" ? terminalTokenModeForModel(model, next) : next;
    localStorage.setItem("vibyra.desktop.terminalTokenMode", setupTokenMode);
    render();
    return;
  }
  const terminal = findTerminal(target);
  if (!terminal) return;
  const model = typeof terminalModelForDisplay === "function" ? terminalModelForDisplay(terminal.model) : null;
  updateTerminal(target, { tokenMode: typeof terminalTokenModeForModel === "function" ? terminalTokenModeForModel(model, next) : next });
}

async function connectOpenAiProvider(form) {
  const data = new FormData(form);
  providerConnectPosting = true;
  providerConnectNotice = "";
  render();
  try {
    const response = await fetch("/desktop/provider-accounts/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: data.get("apiKey"),
        organization: data.get("organization"),
        project: data.get("project")
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.error || "OpenAI connection failed.");
    providerAccounts = result.providers || { ...providerAccounts, openai: result.account };
    providerConnectOpen = false;
    providerConnectNotice = "OpenAI connected.";
  } catch (error) {
    providerConnectNotice = error instanceof Error ? error.message : "OpenAI connection failed.";
  } finally {
    providerConnectPosting = false;
    render();
  }
}

async function disconnectOpenAiProvider() {
  providerConnectPosting = true;
  providerConnectNotice = "";
  render();
  try {
    const response = await fetch("/desktop/provider-accounts/openai/disconnect", { method: "POST" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.error || "OpenAI disconnect failed.");
    providerAccounts = result.providers || { ...providerAccounts, openai: result.account };
    setupTokenMode = "vibyra";
    terminals.forEach((terminal) => {
      if (terminal.tokenMode === "provider") terminal.tokenMode = "vibyra";
    });
    saveTerminals();
  } catch (error) {
    providerConnectNotice = error instanceof Error ? error.message : "OpenAI disconnect failed.";
  } finally {
    providerConnectPosting = false;
    render();
  }
}
