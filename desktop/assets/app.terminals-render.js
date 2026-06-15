function renderTerminalsPage() {
  if (typeof captureTerminalModelScrolls === "function") captureTerminalModelScrolls(nodes.content);
  ensureTerminal();
  const shouldForceRender = forceTerminalRender;
  forceTerminalRender = false;
  const activeDraft = focusedTerminalDraft();
  if (!shouldForceRender && activeDraft && renderedTerminalDraft(activeDraft.id)) {
    fitTerminalDraft(activeDraft.field);
    return;
  }
  if (terminalBatchSetupOpen || !terminals.length) {
    const activeSearch = typeof focusedTerminalModelSearch === "function" ? focusedTerminalModelSearch() : null;
    const hasSetupPicker = nodes.content.querySelector('[data-terminal-model-picker="setup"]');
    const hasProjectMenu = terminalProjectMenuTarget === "setup" && nodes.content.querySelector('[data-terminal-project-menu="setup"]');
    if ((activeSearch?.target === "setup" || (setupModelMenuOpen && hasSetupPicker) || hasProjectMenu) && nodes.content.querySelector(".terminal-setup")) return;
    const existingSetup = nodes.content.querySelector(".terminal-setup");
    if (existingSetup && typeof patchTerminalSetupPanel === "function" && patchTerminalSetupPanel(existingSetup)) return;
    nodes.content.innerHTML = setupView();
    bindTerminalControls();
    return;
  }
  if (typeof syncTerminalFullscreenState === "function") syncTerminalFullscreenState();
  const projectTerminals = typeof terminalsForProjectKey === "function" ? terminalsForProjectKey() : terminals;
  const active = findTerminal(activeTerminalId) || projectTerminals[0] || terminals[0];
  const grid = terminalLayout === "grid";
  const gridMeta = grid ? terminalGridMeta(projectTerminals.length) : null;
  const gridClass = grid ? `grid-mode ${gridMeta.className}` : "";
  const gridStyle = grid ? ` style="--terminal-grid-cols:${gridMeta.cols};--terminal-grid-rows:${gridMeta.rows};--terminal-grid-cols-narrow:${gridMeta.narrowCols};--terminal-grid-rows-narrow:${gridMeta.narrowRows};"` : "";
  const fullscreenClass = typeof fullscreenTerminalId === "string" && fullscreenTerminalId ? " terminal-page--terminal-fullscreen" : "";
  const emptyProject = projectTerminals.length ? "" : terminalWorkspaceEmptyHtml();
  const terminalViews = projectTerminals.length ? (grid ? terminals.map(terminalTile).join("") : terminalFocusViews(active)) : "";
  const teamBar = typeof terminalTeamBarHtml === "function" ? terminalTeamBarHtml(projectTerminals) : "";
  const teamClass = teamBar ? " terminal-page--team" : "";
  nodes.content.innerHTML = `<section class="terminal-page ${gridClass}${fullscreenClass}${teamClass}"${gridStyle}><div class="terminal-primary-shell"><div class="terminal-body-shell"><div class="terminal-main-shell">${teamBar}<div class="terminal-stage">${emptyProject}${terminalViews}</div></div></div></div></section>`;
  bindTerminalControls();
  requestAnimationFrame(() => document.querySelectorAll(".terminal-lines").forEach((node) => node.scrollTo(0, node.scrollHeight)));
}

function terminalGridMeta(count) {
  const total = Math.max(1, Math.min(maxTerminals, Number(count) || 1));
  const cols = total <= 2 ? total : total <= 4 ? 2 : total <= 6 ? 3 : total <= 8 ? 4 : total === 9 ? 3 : 4;
  const narrowCols = total <= 2 ? total : total <= 4 ? 2 : 3;
  return {
    className: total > 4 ? "terminal-grid-many" : "",
    cols,
    rows: Math.ceil(total / cols),
    narrowCols,
    narrowRows: Math.ceil(total / narrowCols)
  };
}

function setupView() {
  const model = selectedSetupModel();
  return `<section class="terminal-setup"><div class="terminal-setup-stage"><div class="terminal-setup-panel"><div class="terminal-setup-copy"><span class="terminal-setup-icon">${icon("terminal")}</span><h2>Start AI terminals</h2></div><div class="terminal-setup-grid"><div class="terminal-setup-block"><p>How many?</p><div class="terminal-count-row">${[1, 2, 3, 4, 6, 12].map((count) => `<button class="${setupCount === count ? "active" : ""}" type="button" data-terminal-count="${count}">${count}</button>`).join("")}</div><label class="terminal-custom-count">${icon("edit")}<input type="number" min="1" max="${maxTerminals}" value="${setupCount}" data-terminal-custom-count aria-label="Custom terminal count" /><span>Custom</span></label></div><div class="terminal-setup-block terminal-preview-block"><p>Preview</p>${layoutPreview(setupCount)}</div></div><div class="terminal-setup-block"><p>Model</p><div class="terminal-model-select-wrap">${terminalModelSelectButton("setup", model)}${setupModelMenuOpen ? terminalModelMenu("setup", model.key) : ""}</div></div>${terminalSetupEffortPicker(model)}<button class="primary-button terminal-start-button" type="button" id="start-terminals">${icon("plus")}Open ${setupCount} terminal${setupCount === 1 ? "" : "s"}</button></div></div></section>`;
}

function terminalSetupEffortPicker(model = selectedSetupModel()) {
  const efforts = terminalReasoningEfforts(model);
  if (!efforts.length) return "";
  return `<div class="terminal-setup-block"><p>Reasoning effort</p><div class="terminal-effort-row" role="radiogroup" aria-label="Terminal reasoning effort">${efforts.map((effort) => `<button class="${setupEffort === effort.value ? "active" : ""}" type="button" role="radio" aria-checked="${setupEffort === effort.value}" data-terminal-setup-effort="${escapeAttribute(effort.value)}"><strong>${escapeHtml(effort.label)}</strong><small>${escapeHtml(effort.hint || effort.short || "")}</small></button>`).join("")}</div></div>`;
}

function terminalTabs() {
  const tabs = terminals.map((terminal, index) => `<div class="terminal-tab ${terminal.id === activeTerminalId ? "active" : ""}" draggable="true" data-terminal-drag="${escapeAttribute(terminal.id)}" title="${escapeAttribute(terminal.title)}"><button class="terminal-tab-open" type="button" data-terminal-focus="${escapeAttribute(terminal.id)}" aria-label="Open ${escapeAttribute(terminal.title)}">${typeof terminalStatusDot === "function" ? terminalStatusDot(terminal) : `<span class="terminal-status ${terminal.pending ? "running" : ""}"></span>`}<span>${index + 1}</span></button><button class="terminal-tab-close" type="button" data-terminal-close="${escapeAttribute(terminal.id)}" aria-label="Close ${escapeAttribute(terminal.title)}">${icon("close")}</button></div>`).join("");
  const companionTools = typeof terminalCompanionToolbarHtml === "function" ? terminalCompanionToolbarHtml() : "";
  return `<header class="terminal-tabs"><div class="terminal-new-wrap"><button class="terminal-add" id="open-terminal-new" type="button" aria-label="New terminal" title="New terminal" ${terminals.length >= maxTerminals ? "disabled" : ""}>${icon("plus")}</button>${newTerminalMenuOpen ? newTerminalMenu() : ""}</div><div class="terminal-tab-list">${tabs}</div>${companionTools}<button class="terminal-layout-button" id="toggle-terminal-layout" type="button" aria-label="Toggle terminal layout" title="${terminalLayout === "grid" ? "Focus view" : "Grid view"}">${icon(terminalLayout === "grid" ? "terminal" : "grid")}</button></header>`;
}

function newTerminalMenu() {
  return terminalModelMenu("new", selectedSetupModel().key);
}

function activeTerminalView(terminal) {
  return `<article class="terminal-focus ${terminalProviderClass(terminal)} ${terminal.notice ? "has-notice" : ""}" data-terminal="${escapeAttribute(terminal.id)}"><header class="terminal-focus-head"><div class="terminal-name"><span class="terminal-status ${terminal.pending ? "running" : ""}"></span><strong>${escapeHtml(terminal.title)}</strong></div><div class="terminal-meta">${modelMetaChip(terminal)}<button class="terminal-settings-button" type="button" data-terminal-settings="${escapeAttribute(terminal.id)}" aria-label="Terminal settings" title="Terminal settings">${icon("menu")}</button>${settingsTerminalId === terminal.id ? settingsMenu(terminal) : ""}</div></header>${terminal.notice ? terminalNotice(terminal) : ""}<div class="terminal-lines">${terminalBanner(terminal, false)}${terminal.messages.map((message) => terminalLine(message, terminal)).join("")}${terminalIdleLine(terminal)}</div>${terminalComposer(terminal)}</article>`;
}

function terminalFocusViews(active) {
  return activeTerminalView(active);
}

function terminalTile(terminal) {
  const active = terminal.id === activeTerminalId;
  return `<article class="terminal-tile ${terminalProviderClass(terminal)} ${active ? "active" : ""} ${terminal.notice ? "has-notice" : ""}" data-terminal="${escapeAttribute(terminal.id)}"><header class="terminal-tile-head"><button type="button" data-terminal-focus="${escapeAttribute(terminal.id)}"><span class="terminal-status ${terminal.pending ? "running" : ""}"></span><strong>${escapeHtml(terminal.title)}</strong></button><button class="terminal-settings-button" type="button" data-terminal-settings="${escapeAttribute(terminal.id)}" aria-label="Terminal settings">${icon("menu")}</button>${settingsTerminalId === terminal.id ? settingsMenu(terminal) : ""}</header>${terminal.notice ? terminalNotice(terminal) : ""}<div class="terminal-lines">${terminalBanner(terminal, true)}${terminal.messages.map((message) => terminalLine(message, terminal)).join("")}${terminalIdleLine(terminal)}</div>${terminalComposer(terminal)}</article>`;
}

function terminalComposer(terminal) {
  const profile = terminalProviderProfile(terminal);
  const prompt = terminal.shellMode && profile.shellPromptToken ? profile.shellPromptToken : profile.promptToken;
  const placeholder = terminal.shellMode ? profile.shellPlaceholder : profile.placeholder;
  return `<div class="terminal-composer-wrap"><form class="terminal-composer" data-terminal-form="${escapeAttribute(terminal.id)}"><span class="terminal-composer-prompt" aria-hidden="true">${escapeHtml(prompt)}</span><textarea data-terminal-draft="${escapeAttribute(terminal.id)}" rows="1" placeholder="${escapeAttribute(placeholder)}" ${terminal.pending ? "disabled" : ""}>${escapeHtml(terminal.draft)}</textarea></form>${terminalCommandPalette(terminal)}</div>`;
}

function terminalCommandPalette(terminal) {
  const options = terminalCommandOptions(terminal);
  if (!options.length) return "";
  const active = Math.min(Math.max(terminalCommandIndexes[terminal.id] || 0, 0), options.length - 1);
  terminalCommandIndexes[terminal.id] = active;
  const rows = options.map((option, index) => `<button class="terminal-command-option ${index === active ? "active" : ""}" type="button" data-terminal-command-pick="${escapeAttribute(option.command)}" data-terminal-id="${escapeAttribute(terminal.id)}"><strong>${escapeHtml(option.command)}</strong><span>${escapeHtml(option.hint)}</span></button>`).join("");
  return `<div class="terminal-command-menu" data-terminal-command-menu="${escapeAttribute(terminal.id)}" role="listbox" aria-label="Terminal slash commands">${rows}</div>`;
}

function settingsMenu(terminal) {
  const effortRow = terminalReasoningEfforts(terminal.model).length ? selectRow("effort", "bolt", terminal, effortOptions(terminal)) : "";
  return `<div class="terminal-menu terminal-settings-menu">${selectRow("model", "sparkles", terminal, modelOptions(terminal))}${effortRow}${selectRow("projectId", "folder", terminal, projectOptions(terminal))}<button class="terminal-close-row" type="button" data-terminal-close="${escapeAttribute(terminal.id)}">${icon("trash")}Close terminal</button></div>`;
}

function selectRow(field, iconName, terminal, options) {
  const labels = { effort: "Reasoning effort", model: "Model", projectId: "Project" };
  return `<div class="terminal-settings-row">${icon(iconName)}${customSelectHtml({
    id: `terminal-${terminal.id}-${field}`,
    ariaLabel: labels[field] || field,
    value: terminal[field] || "",
    options,
    inputAttributes: {
      "data-terminal-field": field,
      "data-terminal-id": terminal.id
    }
  })}</div>`;
}

function modelOptions(terminal) {
  return terminalModelGroups().flatMap((group) => group.options.map((model) => ({
    value: model.key,
    label: model.label,
    group: group.title || ""
  })));
}

function effortOptions(terminal) {
  return terminalReasoningEfforts(terminal.model).map((effort) => ({
    value: effort.value,
    label: effort.label
  }));
}

function projectOptions(terminal) {
  return [
    { value: "", label: "No project" },
    ...(currentState.projects || []).map((project) => ({
      value: project.id,
      label: project.name || "Project"
    }))
  ];
}

function terminalNotice(terminal) {
  const checkpoint = typeof terminalWorkspaceCheckpointLink === "function"
    ? terminalWorkspaceCheckpointLink(terminal)
    : "";
  return `<aside class="terminal-notice" role="status" aria-live="polite"><span>${icon("alert")}</span><p>${escapeHtml(terminal.notice)}${checkpoint}</p><button type="button" data-terminal-notice="${escapeAttribute(terminal.id)}" aria-label="Dismiss terminal notice">${icon("close")}</button></aside>`;
}

function terminalLine(message, terminal) {
  const item = normalizeTerminalMessage(message);
  if (!item) return "";
  const profile = item.provider ? terminalProfiles[item.provider] || terminalProviderProfile(terminal) : terminalProviderProfile(terminal);
  const providerClass = `terminal-provider-${profile.key}`;
  if (item.role === "user") return `<div class="terminal-line user ${providerClass}"><span class="terminal-prompt">${escapeHtml(profile.historyPromptToken || profile.promptToken)}</span><pre>${terminalInline(item.text)}</pre></div>`;
  if (item.type === "shell") return terminalShellLine(item, profile);
  if (item.type === "tool") return terminalToolLine(item, profile);
  if (item.type === "mention") return terminalMentionLine(item, profile);
  if (item.type === "todo") return terminalTodoLine(item, profile);
  if (item.type === "approval") return terminalApprovalLine(item, profile);
  if (item.type === "review") return terminalReviewLine(item, profile);
  if (item.type === "diff") return `<div class="terminal-line diff ${providerClass}"><span class="terminal-assistant-token">${escapeHtml(profile.assistantToken)}</span><pre>${escapeHtml(item.text)}</pre></div>`;
  if (item.type === "help") return terminalHelpLine(item, profile);
  if (item.type === "system" || item.role === "system") return terminalSystemLine(item, profile);
  return `<div class="terminal-line assistant ${providerClass}"><span class="terminal-assistant-token">${escapeHtml(profile.assistantToken)}</span><pre>${terminalInline(item.text)}</pre></div>`;
}

function terminalSystemLine(item, profile) { return `<div class="terminal-line system terminal-provider-${profile.key}"><span class="terminal-assistant-token">${escapeHtml(profile.assistantToken)}</span><pre>${terminalInline(item.text)}</pre></div>`; }
function terminalShellLine(item, profile) { const command = item.meta?.command || item.text; const output = item.meta?.args || "Not executed in Vibyra Desktop. Local command approval is not wired for provider terminals yet."; const token = profile.key === "claude" ? profile.shellOutputToken : profile.key === "gemini" ? "✓" : "$"; return `<div class="terminal-line shell terminal-provider-${profile.key}"><span class="terminal-assistant-token">${escapeHtml(token)}</span><pre><strong>${escapeHtml(command)}</strong>\n${escapeHtml(output)}</pre></div>`; }
function terminalToolLine(item, profile) { return `<div class="terminal-line tool terminal-provider-${profile.key}"><span class="terminal-assistant-token">${escapeHtml(profile.key === "gemini" ? "✓" : profile.assistantToken)}</span><pre>${terminalInline(item.text)}</pre></div>`; }
function terminalMentionLine(item, profile) { const path = item.meta?.path || item.text; return `<div class="terminal-line mention terminal-provider-${profile.key}"><span class="terminal-assistant-token">@</span><pre><strong>${escapeHtml(profile.mentionLabel)}</strong> ${escapeHtml(path)}</pre></div>`; }
function terminalTodoLine(item, profile) { const rows = item.text.split("\n").filter(Boolean).map((line) => `<li>${escapeHtml(line)}</li>`).join(""); return `<div class="terminal-line todo terminal-provider-${profile.key}"><span class="terminal-assistant-token">${escapeHtml(profile.assistantToken)}</span><div class="terminal-block"><strong>Update Todos</strong><ul>${rows}</ul></div></div>`; }
function terminalApprovalLine(item, profile) { return `<div class="terminal-line approval terminal-provider-${profile.key}"><span class="terminal-assistant-token">${escapeHtml(profile.assistantToken)}</span><pre>${terminalInline(item.text)}</pre></div>`; }
function terminalReviewLine(item, profile) { return `<div class="terminal-line review terminal-provider-${profile.key}"><span class="terminal-assistant-token">${escapeHtml(profile.assistantToken)}</span><pre>${terminalInline(item.text)}</pre></div>`; }
function terminalHelpLine(item, profile) { const rows = item.text.split("\n").filter(Boolean).map((line) => `<li>${terminalInline(line)}</li>`).join(""); return `<div class="terminal-line help terminal-provider-${profile.key}"><span class="terminal-assistant-token">${escapeHtml(profile.assistantToken)}</span><div class="terminal-block"><strong>${escapeHtml(profile.label)} commands</strong><ul>${rows}</ul></div></div>`; }

function terminalIdleLine(terminal) {
  const profile = terminalProviderProfile(terminal);
  if (terminal.pending || terminal.messages.length || profile.key !== "gemini") return "";
  return `<div class="terminal-line system terminal-provider-gemini terminal-idle"><span class="terminal-assistant-token">${escapeHtml(profile.idleToken)}</span><pre>${escapeHtml(profile.idleText)}</pre></div>`;
}

function terminalInline(text) {
  return String(text || "").split(/(@[\w./~-]+|\/[a-zA-Z?][\w?-]*|![^\s]+)/g).map((part) => {
    if (!part) return "";
    if (part.startsWith("@")) return `<span class="terminal-inline-mention">${escapeHtml(part)}</span>`;
    if (part.startsWith("/")) return `<span class="terminal-inline-command">${escapeHtml(part)}</span>`;
    if (part.startsWith("!")) return `<span class="terminal-inline-shell">${escapeHtml(part)}</span>`;
    return escapeHtml(part);
  }).join("");
}

function terminalBanner(terminal, compact = false) {
  const profile = terminalProviderProfile(terminal);
  const ctx = terminalContext(terminal, profile, compact);
  if (profile.key === "openai") return codexBanner(ctx);
  if (profile.key === "gemini") return geminiBanner(ctx);
  if (profile.key === "claude") return claudeBanner(ctx);
  return vibyraBanner(ctx);
}

function terminalContext(terminal, profile, compact) {
  const model = modelByKey(terminal.model);
  const effort = (config().chatEfforts || []).find((item) => item.value === terminal.effort);
  const effortShort = String(effort?.short || effort?.label || terminal.effort || "medium").toLowerCase();
  const effortLabel = String(effort?.label || terminal.effort || "medium").toLowerCase();
  const planLabel = typeof currentPlanTier === "function" ? `Vibyra ${currentPlanTier()?.name || "Free"}` : "Vibyra";
  const tokenLabel = terminal.tokenMode === "provider"
    ? providerTokenLabelForModel(model)
    : planLabel;
  const account = typeof currentAccount === "function" ? currentAccount() : {};
  const firstName = String(account?.name || "").trim().split(/\s+/)[0] || "";
  const project = projectForTerminal(terminal);
  const cwd = terminal.cwd || project?.path || "Default workspace";
  const version = profile.version || ((typeof vibyraDesktopVersion === "string" && vibyraDesktopVersion) || "2.1.0");
  return { terminal, profile, model, effortShort, effortLabel, planLabel: tokenLabel, firstName, cwd, version, compact };
}

function claudeBanner({ profile, model, effortLabel, planLabel, firstName, cwd, version, compact }) {
  const art = " ▐▛███▜▌\n▝▜█████▛▘\n  ▘▘ ▝▝";
  const greeting = firstName ? `Welcome back ${firstName}!` : "Welcome back!";
  const meta = `${model.label} with ${effortLabel} effort · ${planLabel} ·`;
  return `<div class="terminal-banner terminal-banner-claude ${compact ? "compact" : ""}">${claudeCodeBox({ art, compact, cwd, greeting, meta, profile, version })}</div>`;
}

function claudeCodeBox({ art, compact, cwd, greeting, meta, profile, version }) {
  const width = compact ? 58 : 86;
  const divider = "─".repeat(width - 2);
  const logoLines = art.split("\n");
  const rows = compact
    ? [
        claudeBoxRow(`Claude Code v${version}`, width),
        claudeBoxHtmlRow(claudeCenteredHtml(`<span class="terminal-claude-logo">${escapeHtml(logoLines[0])}</span>`, logoLines[0], width - 2), width),
        claudeBoxHtmlRow(claudeCenteredHtml(`<span class="terminal-claude-logo">${escapeHtml(logoLines[1])}</span>`, logoLines[1], width - 2), width),
        claudeBoxHtmlRow(claudeCenteredHtml(`<span class="terminal-claude-logo">${escapeHtml(logoLines[2])}</span>`, logoLines[2], width - 2), width),
        claudeBoxRow(meta, width),
        claudeBoxRow(cwd, width)
      ]
    : [
        claudeBoxRow(`Claude Code v${version}`, width),
        claudeBoxRow("", width),
        claudeBoxRow(greeting, width, true),
        ...logoLines.map((line) => claudeBoxHtmlRow(claudeCenteredHtml(`<span class="terminal-claude-logo">${escapeHtml(line)}</span>`, line, width - 2), width)),
        claudeBoxRow("", width),
        claudeBoxRow(meta, width, true),
        claudeBoxRow(profile.label, width, true),
        claudeBoxRow(cwd, width, true),
        claudeBoxRow("", width),
        claudeBoxColumns("Tips for getting started", "What's new", width),
        claudeBoxColumns("Ask Claude to edit, debug, or explain a file.", "Provider-scoped commands.", width),
        claudeBoxColumns("Use /plan before larger changes.", "Shell syntax and file mentions.", width),
        claudeBoxRow("", width),
        claudeBoxRow("─".repeat(width - 6), width, true),
        claudePromptRow('Try "edit AppContext.tsx to..."', width),
        claudeBoxRow("─".repeat(width - 6), width, true),
        claudeBoxColumns("? for shortcuts · ← for agents", "◉ xhigh · /effort", width)
      ];
  return `<pre class="terminal-claude-codebox" aria-label="Claude Code session">╭${divider}╮\n${rows.join("\n")}\n╰${divider}╯</pre>`;
}

function claudeBoxRow(text, width, centered = false) {
  const inner = width - 2;
  const value = centered ? centerPlain(text, inner) : padPlain(text, inner);
  return `│${escapeHtml(value)}│`;
}

function claudeBoxHtmlRow(innerHtml, width) {
  return `│${innerHtml}│`;
}

function claudeBoxColumns(left, right, width) {
  const inner = width - 2;
  const gap = 4;
  const rightWidth = 34;
  const leftWidth = inner - rightWidth - gap;
  return `│${escapeHtml(padPlain(left, leftWidth))}${" ".repeat(gap)}${escapeHtml(padPlain(right, rightWidth))}│`;
}

function claudePromptRow(text, width) {
  const visible = `❯ ${text}`;
  const inner = width - 2;
  const padding = " ".repeat(Math.max(0, inner - visible.length));
  return claudeBoxHtmlRow(`<span class="terminal-claude-prompt">❯</span> ${escapeHtml(text)}${padding}`, width);
}

function claudeCenteredHtml(html, visibleText, width) {
  const visible = String(visibleText || "");
  const left = Math.max(0, Math.floor((width - visible.length) / 2));
  const right = Math.max(0, width - visible.length - left);
  return `${" ".repeat(left)}${html}${" ".repeat(right)}`;
}

function padPlain(text, width) {
  const value = String(text || "").slice(0, width);
  return value + " ".repeat(Math.max(0, width - value.length));
}

function centerPlain(text, width) {
  const value = String(text || "").slice(0, width);
  const left = Math.max(0, Math.floor((width - value.length) / 2));
  return `${" ".repeat(left)}${value}${" ".repeat(Math.max(0, width - value.length - left))}`;
}

function codexBanner({ model, effortShort, planLabel, cwd, version, compact }) {
  const innerWidth = compact ? 46 : 62;
  const pad = (text) => text + " ".repeat(Math.max(0, innerWidth - text.length));
  const titleRow = `>_ OpenAI Codex (v${version})`;
  const modelRow = `model:     ${model.label} ${effortShort}${compact ? "" : "    /model to change"}`.trimEnd();
  const dirRow = `directory: ${cwd}`;
  const top = `╭${"─".repeat(innerWidth + 2)}╮`;
  const bottom = `╰${"─".repeat(innerWidth + 2)}╯`;
  const row = (text) => `│ ${pad(text)} │`;
  const box = [top, row(titleRow), row(""), row(modelRow), row(`plan:      ${planLabel}`), row(dirRow), bottom].join("\n");
  return `<div class="terminal-banner terminal-banner-codex"><pre class="terminal-banner-box" aria-label="OpenAI Codex session">${escapeHtml(box)}</pre>${compact ? "" : `<p class="terminal-banner-tip"><strong>Tip:</strong> Use /feedback to send logs to the maintainers when something looks off.</p>`}</div>`;
}

function geminiBanner({ model, planLabel, cwd, version, compact }) {
  if (compact) return `<div class="terminal-banner terminal-banner-gemini compact"><div class="terminal-banner-title">✦ Gemini CLI v${escapeHtml(version)}</div><div class="terminal-banner-meta"><span>${escapeHtml(model.label)}</span><span class="terminal-banner-path">${escapeHtml(cwd)}</span></div></div>`;
  const letters = "GEMINI".split("").map((letter) => `<span>${letter}</span>`).join("");
  return `<div class="terminal-banner terminal-banner-gemini"><div class="terminal-gemini-wordmark"><i>✦</i><strong>${letters}</strong></div><div class="terminal-banner-meta terminal-gemini-meta"><span>Gemini CLI v${escapeHtml(version)}</span><span>Using: Vibyra project context | ${escapeHtml(planLabel)}</span></div><p class="terminal-banner-tip">Tips for getting started:</p><ol class="terminal-banner-tips terminal-banner-tips-numbered"><li>Ask questions, edit files, or run commands.</li><li>Be specific for the best results.</li><li>/help for more information.</li></ol><div class="terminal-gemini-footer"><span>${escapeHtml(cwd)}</span><span>no sandbox (see /docs)</span><span>${escapeHtml(model.label || "auto")}</span></div></div>`;
}

function vibyraBanner({ model, effortShort, planLabel, cwd, version, compact }) {
  const art = "  ▟██▙\n ▐████▌\n  ▜██▛";
  return bannerTemplate({ title: `Vibyra Desktop v${version}`, art, providerClass: "provider-auto", compact, lines: [`<strong>${escapeHtml(model.label)}</strong> with ${escapeHtml(effortShort)}`, escapeHtml(planLabel), `<span class="terminal-banner-path">${escapeHtml(cwd)}</span>`] });
}

function bannerTemplate({ title, art, providerClass, lines, compact }) {
  return `<div class="terminal-banner ${providerClass} ${compact ? "compact" : ""}"><div class="terminal-banner-title">${escapeHtml(title)}</div><div class="terminal-banner-row"><pre class="terminal-banner-art ${providerClass}" aria-hidden="true">${escapeHtml(art)}</pre><div class="terminal-banner-meta">${lines.map((line) => `<span>${line}</span>`).join("")}</div></div>${compact ? "" : `<p class="terminal-banner-tip">Tips for getting started:</p><ul class="terminal-banner-tips"><li>Describe what you want to build and we&apos;ll plan it.</li><li>Use <kbd>/</kbd> for slash commands once a chat is open.</li><li>Press <kbd>↵</kbd> to send, <kbd>Shift</kbd>+<kbd>↵</kbd> for a new line.</li></ul>`}</div>`;
}

function slug(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "workspace";
}
