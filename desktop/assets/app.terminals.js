(function () {
  const storageKey = "vibyra.desktop.aiTerminals";
  const activeKey = "vibyra.desktop.activeTerminal";
  const layoutKey = "vibyra.desktop.terminalsLayout";
  const maxTerminals = 12;
  let terminals = loadTerminals();
  let activeTerminalId = localStorage.getItem(activeKey) || terminals[0]?.id || "";
  let terminalLayout = localStorage.getItem(layoutKey) === "grid" ? "grid" : "focus";
  let newTerminalMenuOpen = false;
  let newTerminalModelSearch = "";
  let settingsTerminalId = "";
  let setupCount = 1;
  let setupModel = localStorage.getItem("vibyra.desktop.chatModel") || "auto";
  let setupModelMenuOpen = false;
  let setupModelSearch = "";

  function config() {
    return window.vibyraDesktopChatConfig || { chatModels: [], chatModelGroups: [], chatEfforts: [], chatSkills: [] };
  }

  function loadTerminals() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return Array.isArray(parsed) ? parsed.map(normalizeTerminal).filter(Boolean).slice(0, maxTerminals) : [];
    } catch {
      return [];
    }
  }

  function normalizeTerminal(item) {
    if (!item || typeof item !== "object") return null;
    return {
      id: String(item.id || "").trim() || terminalId(),
      title: String(item.title || "Terminal").slice(0, 72),
      model: String(item.model || "auto"),
      effort: String(item.effort || "medium"),
      projectId: String(item.projectId || ""),
      draft: String(item.draft || ""),
      pending: false,
      notice: null,
      updatedAt: Number(item.updatedAt) || Date.now(),
      messages: Array.isArray(item.messages)
        ? item.messages.filter((message) => message && ["user", "assistant"].includes(message.role)).map((message) => ({ role: message.role, text: String(message.text || "").slice(0, 12000) })).slice(-50)
        : []
    };
  }

  function terminalId() {
    return `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function saveTerminals() {
    localStorage.setItem(storageKey, JSON.stringify(terminals.map(({ pending, notice, ...terminal }) => terminal).slice(0, maxTerminals)));
    if (activeTerminalId) localStorage.setItem(activeKey, activeTerminalId);
    else localStorage.removeItem(activeKey);
    localStorage.setItem(layoutKey, terminalLayout);
  }

  function ensureTerminal() {
    if (!terminals.length) {
      activeTerminalId = "";
      return;
    }
    if (!terminals.some((terminal) => terminal.id === activeTerminalId)) activeTerminalId = terminals[0]?.id || "";
  }

  function createTerminal(modelKey = setupModel, shouldRender = true) {
    if (terminals.length >= maxTerminals) return null;
    const model = unlockedModel(modelKey);
    const terminal = {
      id: terminalId(),
      title: `Terminal ${terminals.length + 1}`,
      model: model.key,
      effort: "medium",
      projectId: typeof selectedProjectId === "string" ? selectedProjectId : "",
      draft: "",
      pending: false,
      notice: null,
      updatedAt: Date.now(),
      messages: []
    };
    terminals.unshift(terminal);
    activeTerminalId = terminal.id;
    newTerminalMenuOpen = false;
    setupModelMenuOpen = false;
    settingsTerminalId = "";
    saveTerminals();
    if (shouldRender) render();
    return terminal;
  }

  function createTerminals(count = 1, modelKey = setupModel) {
    const total = Math.min(maxTerminals - terminals.length, normalizeCount(count));
    for (let index = 0; index < total; index += 1) createTerminal(modelKey, false);
    render();
  }

  function terminalTopbarSubtitle() {
    ensureTerminal();
    const running = terminals.filter((terminal) => terminal.pending).length;
    return `${terminals.length}/${maxTerminals}${running ? ` running ${running}` : ""}`;
  }

  function terminalTopbarHtml() {
    if (!terminals.length) return "";
    return terminalTabs();
  }

  function renderTerminalsPage() {
    ensureTerminal();
    if (!terminals.length) {
      nodes.content.innerHTML = setupView();
      bindTerminalControls();
      return;
    }
    const active = findTerminal(activeTerminalId) || terminals[0];
    nodes.content.innerHTML = `<section class="terminal-page ${terminalLayout === "grid" ? "grid-mode" : ""}"><div class="terminal-stage">${terminalLayout === "grid" ? terminals.map(terminalTile).join("") : activeTerminalView(active)}</div></section>`;
    bindTerminalControls();
    requestAnimationFrame(() => document.querySelectorAll(".terminal-lines").forEach((node) => node.scrollTo(0, node.scrollHeight)));
  }

  function setupView() {
    const modelKey = selectedSetupModel().key;
    return `<section class="terminal-setup"><div class="terminal-setup-panel"><div class="terminal-setup-copy"><span class="terminal-setup-icon">${icon("terminal")}</span><h2>Start AI terminals</h2></div><div class="terminal-setup-grid"><div class="terminal-setup-block"><p>How many?</p><div class="terminal-count-row">${[1, 2, 3, 4, 6, 12].map((count) => `<button class="${setupCount === count ? "active" : ""}" type="button" data-terminal-count="${count}">${count}</button>`).join("")}</div><label class="terminal-custom-count">${icon("edit")}<input type="number" min="1" max="${maxTerminals}" value="${setupCount}" data-terminal-custom-count aria-label="Custom terminal count" /><span>Custom</span></label></div><div class="terminal-setup-block terminal-preview-block"><p>Preview</p>${layoutPreview(setupCount)}</div></div><div class="terminal-setup-block"><p>Model</p><div class="terminal-model-select-wrap">${terminalModelSelectButton("setup", modelByKey(modelKey))}${setupModelMenuOpen ? terminalModelMenu("setup", modelKey) : ""}</div></div><button class="primary-button terminal-start-button" type="button" id="start-terminals">${icon("plus")}Open ${setupCount} terminal${setupCount === 1 ? "" : "s"}</button></div></section>`;
  }

  function terminalTabs() {
    const tabs = terminals.map((terminal, index) => `<div class="terminal-tab ${terminal.id === activeTerminalId ? "active" : ""}" draggable="true" data-terminal-drag="${escapeAttribute(terminal.id)}" title="${escapeAttribute(terminal.title)}"><button class="terminal-tab-open" type="button" data-terminal-focus="${escapeAttribute(terminal.id)}" aria-label="Open ${escapeAttribute(terminal.title)}"><span class="terminal-status ${terminal.pending ? "running" : ""}"></span><span>${index + 1}</span></button><button class="terminal-tab-close" type="button" data-terminal-close="${escapeAttribute(terminal.id)}" aria-label="Close ${escapeAttribute(terminal.title)}">${icon("close")}</button></div>`).join("");
    return `<header class="terminal-tabs"><div class="terminal-new-wrap"><button class="terminal-add" id="open-terminal-new" type="button" aria-label="New terminal" title="New terminal" ${terminals.length >= maxTerminals ? "disabled" : ""}>${icon("plus")}</button>${newTerminalMenuOpen ? newTerminalMenu() : ""}</div><div class="terminal-tab-list">${tabs}</div><button class="terminal-layout-button" id="toggle-terminal-layout" type="button" aria-label="Toggle terminal layout" title="${terminalLayout === "grid" ? "Focus view" : "Grid view"}">${icon(terminalLayout === "grid" ? "terminal" : "grid")}</button></header>`;
  }

  function newTerminalMenu() {
    return terminalModelMenu("new", selectedSetupModel().key);
  }

  function activeTerminalView(terminal) {
    return `<article class="terminal-focus" data-terminal="${escapeAttribute(terminal.id)}"><header class="terminal-focus-head"><div class="terminal-name"><span class="terminal-status ${terminal.pending ? "running" : ""}"></span><strong>${escapeHtml(terminal.title)}</strong></div><div class="terminal-meta">${modelMetaChip(terminal)}<button class="terminal-settings-button" type="button" data-terminal-settings="${escapeAttribute(terminal.id)}" aria-label="Terminal settings" title="Terminal settings">${icon("menu")}</button>${settingsTerminalId === terminal.id ? settingsMenu(terminal) : ""}</div></header>${terminal.notice ? terminalNotice(terminal) : ""}<div class="terminal-lines">${terminalBanner(terminal)}${terminal.messages.map(terminalLine).join("")}${terminal.pending ? "" : terminalCaret()}</div>${terminalComposer(terminal)}</article>`;
  }

  function terminalTile(terminal) {
    const active = terminal.id === activeTerminalId;
    return `<article class="terminal-tile ${active ? "active" : ""}" data-terminal="${escapeAttribute(terminal.id)}"><header class="terminal-tile-head"><button type="button" data-terminal-focus="${escapeAttribute(terminal.id)}"><span class="terminal-status ${terminal.pending ? "running" : ""}"></span><strong>${escapeHtml(terminal.title)}</strong></button><button class="terminal-settings-button" type="button" data-terminal-settings="${escapeAttribute(terminal.id)}" aria-label="Terminal settings">${icon("menu")}</button>${settingsTerminalId === terminal.id ? settingsMenu(terminal) : ""}</header>${terminal.notice ? terminalNotice(terminal) : ""}<div class="terminal-lines">${terminalBanner(terminal)}${terminal.messages.map(terminalLine).join("")}${terminal.pending ? "" : terminalCaret()}</div>${terminalComposer(terminal)}</article>`;
  }

  function terminalCaret() {
    return `<div class="terminal-line caret-line"><span class="terminal-prompt">&gt;</span><span class="terminal-caret" aria-hidden="true"></span></div>`;
  }

  function terminalComposer(terminal) {
    return `<form class="terminal-composer" data-terminal-form="${escapeAttribute(terminal.id)}"><span class="terminal-composer-prompt" aria-hidden="true">&gt;</span><textarea data-terminal-draft="${escapeAttribute(terminal.id)}" rows="2" placeholder="Type a prompt..." ${terminal.pending ? "disabled" : ""}>${escapeHtml(terminal.draft)}</textarea><button class="send-button" type="submit" aria-label="Send" ${terminal.pending || !terminal.draft.trim() ? "disabled" : ""}>${icon("send")}</button></form>`;
  }

  function settingsMenu(terminal) {
    return `<div class="terminal-menu terminal-settings-menu">${selectRow("model", "sparkles", terminal, modelOptions(terminal))}${selectRow("effort", "bolt", terminal, effortOptions(terminal))}${selectRow("projectId", "folder", terminal, projectOptions(terminal))}<button class="terminal-close-row" type="button" data-terminal-close="${escapeAttribute(terminal.id)}">${icon("trash")}Close terminal</button></div>`;
  }

  function selectRow(field, iconName, terminal, options) {
    return `<label>${icon(iconName)}<select data-terminal-field="${field}" data-terminal-id="${escapeAttribute(terminal.id)}">${options}</select></label>`;
  }

  function modelOptions(terminal) {
    return config().chatModelGroups.map((group) => `${group.title ? `<optgroup label="${escapeAttribute(group.title)}">` : ""}${group.options.map((model) => `<option value="${escapeAttribute(model.key)}" ${terminal.model === model.key ? "selected" : ""}>${escapeHtml(model.label)}</option>`).join("")}${group.title ? "</optgroup>" : ""}`).join("");
  }

  function effortOptions(terminal) {
    return config().chatEfforts.map((effort) => `<option value="${escapeAttribute(effort.value)}" ${terminal.effort === effort.value ? "selected" : ""}>${escapeHtml(effort.label)}</option>`).join("");
  }

  function projectOptions(terminal) {
    return `<option value="">No project</option>${(currentState.projects || []).map((project) => `<option value="${escapeAttribute(project.id)}" ${terminal.projectId === project.id ? "selected" : ""}>${escapeHtml(project.name || "Project")}</option>`).join("")}`;
  }

  function terminalNotice(terminal) {
    return `<aside class="terminal-notice"><span>${icon("alert")}</span><p>${escapeHtml(terminal.notice)}</p><button type="button" data-terminal-notice="${escapeAttribute(terminal.id)}">${icon("close")}</button></aside>`;
  }

  function terminalLine(message) {
    if (message.role === "user") {
      return `<div class="terminal-line user"><span class="terminal-prompt">&gt;</span><pre>${escapeHtml(message.text)}</pre></div>`;
    }
    return `<div class="terminal-line assistant"><pre>${escapeHtml(message.text)}</pre></div>`;
  }

  function terminalBanner(terminal) {
    const model = modelByKey(terminal.model);
    const provider = model?.provider || "auto";
    const effort = (config().chatEfforts || []).find((item) => item.value === terminal.effort);
    const effortShort = String(effort?.short || effort?.label || terminal.effort || "medium").toLowerCase();
    const planLabel = typeof currentPlanTier === "function" ? `Vibyra ${currentPlanTier()?.name || "Free"}` : "Vibyra";
    const project = projectForTerminal(terminal);
    const cwd = project?.name ? `~/${slug(project.name)}` : "~/workspace";
    const version = (typeof vibyraDesktopVersion === "string" && vibyraDesktopVersion) || "2.1.0";
    const ctx = { model, provider, effortShort, planLabel, cwd, version };
    if (provider === "openai") return codexBanner(ctx);
    if (provider === "gemini") return geminiBanner(ctx);
    if (provider === "claude") return claudeBanner(ctx);
    return vibyraBanner(ctx);
  }

  function claudeBanner({ model, effortShort, planLabel, cwd, version }) {
    const art = " ▐▛███▜▌\n▝▜█████▛▘\n  ▘▘ ▝▝";
    return bannerTemplate({
      title: `Claude Code v${version}`,
      art,
      providerClass: "provider-claude",
      lines: [
        `<strong>${escapeHtml(model.label)}</strong> with ${escapeHtml(effortShort)}`,
        escapeHtml(planLabel),
        `<span class="terminal-banner-path">${escapeHtml(cwd)}</span>`
      ]
    });
  }

  function vibyraBanner({ model, effortShort, planLabel, cwd, version }) {
    const art = "  ▟██▙\n ▐████▌\n  ▜██▛";
    return bannerTemplate({
      title: `Vibyra Desktop v${version}`,
      art,
      providerClass: "provider-auto",
      lines: [
        `<strong>${escapeHtml(model.label)}</strong> with ${escapeHtml(effortShort)}`,
        escapeHtml(planLabel),
        `<span class="terminal-banner-path">${escapeHtml(cwd)}</span>`
      ]
    });
  }

  function codexBanner({ model, effortShort, planLabel, cwd, version }) {
    const innerWidth = 56;
    const pad = (text) => text + " ".repeat(Math.max(0, innerWidth - text.length));
    const titleRow = `>_ OpenAI Codex (v${version})`;
    const modelRow = `model:     ${model.label}${effortShort ? ` · ${effortShort}` : ""}`;
    const planRow = `plan:      ${planLabel}`;
    const dirRow = `directory: ${cwd}`;
    const top = `╭${"─".repeat(innerWidth + 2)}╮`;
    const bottom = `╰${"─".repeat(innerWidth + 2)}╯`;
    const row = (text) => `│ ${pad(text)} │`;
    const box = [top, row(titleRow), row(""), row(modelRow), row(planRow), row(dirRow), bottom].join("\n");
    return `<div class="terminal-banner provider-openai"><pre class="terminal-banner-box" aria-label="OpenAI Codex session">${escapeHtml(box)}</pre><p class="terminal-banner-tip">Tips for getting started:</p><ul class="terminal-banner-tips"><li>Ask Codex to plan a change before writing it.</li><li>Use <kbd>/</kbd> for slash commands once a chat is open.</li><li>Press <kbd>↵</kbd> to send, <kbd>Shift</kbd>+<kbd>↵</kbd> for a new line.</li></ul></div>`;
  }

  function geminiBanner({ model, effortShort, planLabel, cwd, version }) {
    const art = " ███         █████████ \n░░░███      ███░░░░░███\n  ░░░███   ███     ░░░ \n    ░░░███░███         \n     ███░ ░███    █████\n   ███░   ░░███  ░░███ \n ███░      ░░█████████ \n░░░         ░░░░░░░░░  ";
    return `<div class="terminal-banner provider-gemini"><div class="terminal-banner-title">Gemini CLI v${escapeHtml(version)}</div><pre class="terminal-banner-art-wide provider-gemini" aria-hidden="true">${escapeHtml(art)}</pre><div class="terminal-banner-stack"><span><strong>${escapeHtml(model.label)}</strong> with ${escapeHtml(effortShort)}</span><span>${escapeHtml(planLabel)}</span><span class="terminal-banner-path">${escapeHtml(cwd)}</span></div><p class="terminal-banner-tip">Tips for getting started:</p><ul class="terminal-banner-tips"><li>Ask questions, edit files, or run commands.</li><li>Use <kbd>/</kbd> for slash commands once a chat is open.</li><li>Press <kbd>↵</kbd> to send, <kbd>Shift</kbd>+<kbd>↵</kbd> for a new line.</li></ul></div>`;
  }

  function bannerTemplate({ title, art, providerClass, lines }) {
    return `<div class="terminal-banner ${providerClass}"><div class="terminal-banner-title">${escapeHtml(title)}</div><div class="terminal-banner-row"><pre class="terminal-banner-art ${providerClass}" aria-hidden="true">${escapeHtml(art)}</pre><div class="terminal-banner-meta">${lines.map((line) => `<span>${line}</span>`).join("")}</div></div><p class="terminal-banner-tip">Tips for getting started:</p><ul class="terminal-banner-tips"><li>Describe what you want to build and we'll plan it.</li><li>Use <kbd>/</kbd> for slash commands once a chat is open.</li><li>Press <kbd>↵</kbd> to send, <kbd>Shift</kbd>+<kbd>↵</kbd> for a new line.</li></ul></div>`;
  }

  function slug(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "workspace";
  }

  function bindTerminalControls() {
    document.getElementById("open-terminal-new")?.addEventListener("click", () => { newTerminalMenuOpen = !newTerminalMenuOpen; settingsTerminalId = ""; render(); });
    document.getElementById("toggle-terminal-layout")?.addEventListener("click", () => { terminalLayout = terminalLayout === "grid" ? "focus" : "grid"; saveTerminals(); render(); });
    document.getElementById("start-terminals")?.addEventListener("click", () => createTerminals(document.querySelector("[data-terminal-custom-count]")?.value || setupCount, setupModel));
    document.querySelectorAll("[data-terminal-count]").forEach((button) => button.addEventListener("click", () => { setupCount = normalizeCount(button.dataset.terminalCount); render(); }));
    document.querySelector("[data-terminal-custom-count]")?.addEventListener("change", (event) => { setupCount = normalizeCount(event.target.value); render(); });
    document.querySelector("[data-terminal-setup-model-toggle]")?.addEventListener("click", () => { setupModelMenuOpen = !setupModelMenuOpen; render(); });
    document.querySelectorAll("[data-terminal-model-search]").forEach((input) => input.addEventListener("input", () => updateTerminalModelSearch(input)));
    document.querySelectorAll("[data-terminal-setup-model]").forEach((button) => button.addEventListener("click", () => selectSetupModel(button.dataset.terminalSetupModel || "auto")));
    document.querySelectorAll("[data-terminal-new-model]").forEach((button) => button.addEventListener("click", () => createTerminalFromModel(button.dataset.terminalNewModel || "auto")));
    document.querySelectorAll("[data-terminal-focus]").forEach((button) => button.addEventListener("click", () => setActiveTerminal(button.dataset.terminalFocus)));
    document.querySelectorAll("[data-terminal-drag]").forEach((tab) => bindTerminalDrag(tab));
    document.querySelectorAll("[data-terminal-settings]").forEach((button) => button.addEventListener("click", () => { settingsTerminalId = settingsTerminalId === button.dataset.terminalSettings ? "" : button.dataset.terminalSettings; newTerminalMenuOpen = false; render(); }));
    document.querySelectorAll("[data-terminal-close]").forEach((button) => button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeTerminal(button.dataset.terminalClose);
    }));
    document.querySelectorAll("[data-terminal-notice]").forEach((button) => button.addEventListener("click", () => updateTerminal(button.dataset.terminalNotice, { notice: null })));
    document.querySelectorAll("[data-terminal-field]").forEach((field) => field.addEventListener("change", () => updateField(field)));
    document.querySelectorAll("[data-terminal-draft]").forEach((field) => field.addEventListener("input", () => updateDraft(field)));
    document.querySelectorAll("[data-terminal-form]").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); sendTerminal(form.dataset.terminalForm); }));
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
    field.closest(".terminal-focus, .terminal-tile")?.querySelector(".send-button")?.toggleAttribute("disabled", !field.value.trim() || terminal.pending);
  }

  function setActiveTerminal(id) {
    activeTerminalId = id;
    settingsTerminalId = "";
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

  function moveTerminal(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    const fromIndex = terminals.findIndex((terminal) => terminal.id === fromId);
    const toIndex = terminals.findIndex((terminal) => terminal.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [terminal] = terminals.splice(fromIndex, 1);
    terminals.splice(toIndex, 0, terminal);
    saveTerminals();
    render();
  }

  function closeTerminal(id) {
    terminals = terminals.filter((terminal) => terminal.id !== id);
    if (!terminals.length) activeTerminalId = "";
    else if (activeTerminalId === id) activeTerminalId = terminals[0]?.id || "";
    settingsTerminalId = "";
    saveTerminals();
    render();
  }

  function updateTerminal(id, patch) {
    const terminal = findTerminal(id);
    if (!terminal) return;
    Object.assign(terminal, patch, { updatedAt: Date.now() });
    saveTerminals();
    render();
  }

  async function sendTerminal(id) {
    const terminal = findTerminal(id);
    if (!terminal || terminal.pending) return;
    const text = terminal.draft.trim();
    if (!text) return;
    const model = (config().chatModels || []).find((item) => item.key === terminal.model);
    if (typeof modelLocked === "function" && modelLocked(model) && typeof firstUnlockedModel === "function") terminal.model = firstUnlockedModel();
    const history = terminal.messages.slice(-8).map((message) => ({ role: message.role, text: message.text }));
    const pending = { role: "assistant", text: "Thinking..." };
    terminal.messages.push({ role: "user", text }, pending);
    terminal.draft = "";
    terminal.pending = true;
    terminal.notice = null;
    terminal.updatedAt = Date.now();
    saveTerminals();
    render();
    try {
      const result = await requestDesktopChat({ history, model: terminal.model, mode: "chat", projectId: terminal.projectId, prompt: text, reasoningEffort: terminal.effort, skill: "", tool: "", attachments: [] });
      pending.text = result.reply || "I received an empty response from Vibyra AI.";
      if (result.title && /^Terminal \d+$/i.test(terminal.title)) terminal.title = String(result.title).slice(0, 72);
    } catch (error) {
      pending.text = error instanceof Error ? error.message : "Vibyra AI terminal failed. Try again.";
      if (isUsageLimit(error)) terminal.notice = pending.text;
    } finally {
      terminal.pending = false;
      terminal.updatedAt = Date.now();
      saveTerminals();
      render();
    }
  }

  function findTerminal(id) { return terminals.find((terminal) => terminal.id === id) || null; }
  function projectForTerminal(terminal) { return (currentState.projects || []).find((project) => project.id === terminal.projectId) || null; }
  function modelLabel(terminal) { return modelByKey(terminal.model).label || "Auto"; }
  function modelChoices() {
    const models = config().chatModels || [];
    return models.length ? models : [{ key: "auto", label: "Auto", provider: "auto" }];
  }
  function modelByKey(key) {
    return modelChoices().find((model) => model.key === key) || modelChoices()[0];
  }
  function unlockedModel(key) {
    const model = modelByKey(key);
    if (typeof modelLocked === "function" && modelLocked(model) && typeof firstUnlockedModel === "function") return modelByKey(firstUnlockedModel());
    return model;
  }
  function selectedSetupModel() {
    const model = unlockedModel(setupModel);
    setupModel = model.key;
    return model;
  }
  function selectSetupModel(key) {
    const model = modelByKey(key);
    if (typeof modelLocked === "function" && modelLocked(model)) {
      if (typeof openTokenModal === "function") openTokenModal("plans");
      return;
    }
    setupModel = model.key;
    setupModelMenuOpen = false;
    setupModelSearch = "";
    render();
  }
  function updateTerminalModelSearch(input) {
    const target = input.dataset.terminalModelSearch;
    if (target === "setup") setupModelSearch = input.value;
    if (target === "new") newTerminalModelSearch = input.value;
    render();
    requestAnimationFrame(() => {
      const next = document.querySelector(`[data-terminal-model-search="${target}"]`);
      next?.focus();
      next?.setSelectionRange?.(next.value.length, next.value.length);
    });
  }
  function createTerminalFromModel(key) {
    const model = modelByKey(key);
    if (typeof modelLocked === "function" && modelLocked(model)) {
      newTerminalMenuOpen = false;
      if (typeof openTokenModal === "function") openTokenModal("plans");
      render();
      return;
    }
    newTerminalModelSearch = "";
    createTerminal(model.key, true);
  }
  function normalizeCount(value) {
    const numeric = Number.parseInt(String(value || ""), 10);
    return Math.min(maxTerminals, Math.max(1, Number.isFinite(numeric) ? numeric : 1));
  }
  function previewColumns(count) {
    if (count <= 1) return 1;
    if (count <= 4) return 2;
    if (count <= 9) return 3;
    return 4;
  }
  function layoutPreview(count) {
    const total = normalizeCount(count);
    const cells = Array.from({ length: total }, (_, index) => `<span class="${index === 0 ? "active" : ""}"></span>`).join("");
    return `<div class="terminal-layout-preview" style="--terminal-preview-cols:${previewColumns(total)}" aria-label="${total} terminal layout preview">${cells}</div>`;
  }
  function terminalModelSelectButton(target, model) {
    return `<button class="terminal-model-select" type="button" ${target === "setup" ? "data-terminal-setup-model-toggle" : ""}>${modelLogo(model)}<span><strong>${escapeHtml(model.label)}</strong><small>${escapeHtml(modelHint(model, false))}</small></span>${icon("chevron-down")}</button>`;
  }
  function terminalModelMenu(target, selectedKey) {
    const query = target === "setup" ? setupModelSearch : newTerminalModelSearch;
    const models = filteredTerminalModels(query);
    const optionAttribute = target === "setup" ? "data-terminal-setup-model" : "data-terminal-new-model";
    return `<div class="terminal-menu terminal-new-menu terminal-model-menu"><label class="terminal-model-search">${icon("search")}<input data-terminal-model-search="${escapeAttribute(target)}" value="${escapeAttribute(query)}" placeholder="Search models" autocomplete="off" /></label><section class="model-picker-options terminal-model-list" aria-label="Models">${models.length ? models.map((model) => terminalModelButton(model, selectedKey, optionAttribute)).join("") : `<p class="terminal-model-empty">No models found</p>`}</section></div>`;
  }
  function terminalModelButton(model, selectedKey, optionAttribute, extraClass = "") {
    const locked = typeof modelLocked === "function" && modelLocked(model);
    return `<button class="${extraClass} ${selectedKey === model.key ? "active" : ""} ${locked ? "locked" : ""}" type="button" ${optionAttribute}="${escapeAttribute(model.key)}">${modelLogo(model)}<span><strong>${escapeHtml(model.label)}</strong><small>${escapeHtml(modelHint(model, locked))}</small></span>${locked ? `<em>${icon("lock")}</em>` : model.badge ? `<em>${escapeHtml(model.badge)}</em>` : ""}</button>`;
  }
  function terminalModelGroups() {
    const groups = config().chatModelGroups || [];
    return groups.length ? groups : [{ title: "", options: modelChoices() }];
  }
  function filteredTerminalModels(query) {
    const normalized = String(query || "").trim().toLowerCase();
    const models = terminalModelGroups().flatMap((group) => group.options.map((model) => ({ ...model, groupLabel: terminalProviderGroupLabel(group) })));
    if (!normalized) return models;
    return models.filter((model) => [model.label, model.key, model.provider, model.groupLabel].some((value) => String(value || "").toLowerCase().includes(normalized)));
  }
  function terminalModelGroupKey(group) {
    if (typeof modelGroupKey === "function") return modelGroupKey(group);
    return group?.options?.find((model) => model.provider !== "auto")?.provider || "auto";
  }
  function terminalProviderGroupLabel(group) {
    if (typeof providerGroupLabel === "function") return providerGroupLabel(group);
    const key = terminalModelGroupKey(group);
    if (key === "openai") return "OpenAI";
    if (key === "claude") return "Claude";
    if (key === "gemini") return "Gemini";
    return group?.title || "Auto";
  }
  function activeTerminalModelGroup(selectedKey, activeGroupKey, groups) {
    const selectedModel = modelByKey(selectedKey);
    const selectedGroup = terminalModelGroups().find((group) => group.options.some((model) => model.key === selectedModel.key));
    const groupKey = activeGroupKey || terminalModelGroupKey(selectedGroup);
    return groups.find((group) => terminalModelGroupKey(group) === groupKey) || groups.find((group) => terminalModelGroupKey(group) === "openai") || groups[0] || terminalModelGroups()[0];
  }
  function modelLogo(model) {
    if (typeof providerLogo === "function") return providerLogo(model?.provider);
    return `<span class="provider-logo auto">${icon("sparkles")}</span>`;
  }
  function modelHint(model, locked) {
    if (locked && typeof modelTier === "function") return `${modelTier(model)} · upgrade`;
    if (model?.provider === "auto") return "Vibyra chooses";
    return model?.provider || "OpenRouter";
  }
  function modelMetaChip(terminal) {
    const model = modelByKey(terminal.model);
    return `<span class="terminal-meta-chip terminal-model-chip">${modelLogo(model)}${escapeHtml(model.label)}</span>`;
  }
  function isUsageLimit(error) {
    const message = String(error?.message || "").toLowerCase();
    return Number(error?.status) === 429 || message.includes("cap reached") || message.includes("usage limit") || message.includes("rate limit");
  }

  window.renderTerminalsPage = renderTerminalsPage;
  window.terminalTopbarSubtitle = terminalTopbarSubtitle;
  window.terminalTopbarHtml = terminalTopbarHtml;
  if (typeof render === "function" && activePage === "terminals") render();
})();
