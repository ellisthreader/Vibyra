let terminalDynamicModelGroups = null;

function terminalProviderProfile(terminal) {
  const provider = terminalProviderKeyForModel(terminal?.model);
  if (provider === "claude") return terminalProfiles.claude;
  if (provider === "openai") return terminalProfiles.openai;
  if (provider === "gemini") return terminalProfiles.gemini;
  return terminalProfiles.auto;
}

function terminalProviderClass(terminal) {
  const profile = terminalProviderProfile(terminal);
  return `terminal-provider-${profile.key}${terminal.shellMode ? " terminal-shell-mode" : ""}`;
}

function findTerminal(id) { return terminals.find((terminal) => terminal.id === id) || null; }
function projectForTerminal(terminal) {
  if (!terminal?.projectId) return null;
  if (terminal.projectId === "full-pc") {
    return { id: "full-pc", name: "Full PC", path: terminal.cwd || "Home folder" };
  }
  return (currentState.projects || []).find((project) => project.id === terminal.projectId) || null;
}
function modelLabel(terminal) { return modelByKey(terminal.model).label || "Auto"; }
function modelChoices() {
  const groups = terminalModelGroups();
  const models = groups.flatMap((group) => Array.isArray(group.options) ? group.options : []);
  return models.length ? models : [{ key: "auto", label: "Auto", provider: "auto" }];
}
function modelByKey(key) {
  return modelChoices().find((model) => model.key === key) || modelChoices()[0];
}
function terminalProviderKeyForModel(modelOrKey) {
  const key = typeof modelOrKey === "string" ? modelOrKey : modelOrKey?.key;
  const model = typeof modelOrKey === "string" ? modelByKey(key) : modelOrKey;
  const provider = String(model?.provider || "").toLowerCase();
  const company = String(model?.company || "").toLowerCase();
  const value = String(key || model?.modelKey || "").toLowerCase();
  if (provider === "claude" || provider === "anthropic" || company.includes("anthropic") || value.startsWith("anthropic/") || value.startsWith("claude-")) return "claude";
  if (provider === "gemini" || provider === "google" || company.includes("google") || value.startsWith("google/") || value.startsWith("gemini-")) return "gemini";
  if (provider === "openai" || company.includes("openai") || value.startsWith("openai/") || value.startsWith("gpt-") || value.includes("codex")) return "openai";
  return provider || "auto";
}
function terminalModelForDisplay(key) {
  const model = modelByKey(key);
  if (!key || model.key === key) return model;
  return {
    key,
    modelKey: key,
    label: String(key).split("/").pop() || key,
    provider: terminalProviderKeyForModel(key),
    company: ""
  };
}
function unlockedModel(key) {
  const model = modelByKey(key);
  if (typeof modelLocked === "function" && modelLocked(model) && typeof firstUnlockedModel === "function") return modelByKey(firstUnlockedModel());
  return model;
}
function selectedSetupModel() {
  const model = unlockedModel(setupModel);
  setupModel = model.key;
  setupEffort = terminalEffortForModel(model, setupEffort);
  return model;
}
function selectSetupModel(key) {
  const model = modelByKey(key);
  if (typeof modelLocked === "function" && modelLocked(model)) {
    if (typeof openTokenModal === "function") openTokenModal("plans");
    return;
  }
  setupModel = model.key;
  setupEffort = terminalEffortForModel(model, setupEffort);
  localStorage.setItem(setupModelKey, setupModel);
  localStorage.setItem(setupEffortKey, setupEffort);
  setupModelMenuOpen = false;
  terminalProjectMenuTarget = "";
  setupModelSearch = "";
  render();
}
function updateTerminalModelSearch(input) {
  const target = input.dataset.terminalModelSearch;
  if (target === "setup") setupModelSearch = input.value;
  if (target === "new") newTerminalModelSearch = input.value;
  if (target === "setup" || target === "new") modelScrollTops[target] = 0;
  if (!renderTerminalModelSearchResults(input)) render();
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
  terminalProjectMenuTarget = "";
  createTerminal(model.key, true, { effort: terminalEffortForModel(model, setupEffort) });
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
  const groups = filteredTerminalModelGroups(query);
  const optionAttribute = target === "setup" ? "data-terminal-setup-model" : "data-terminal-new-model";
  const projectSelect = target === "new" ? terminalProjectSelect("new") : "";
  return `<div class="terminal-menu terminal-model-picker" data-terminal-model-picker="${escapeAttribute(target)}">${projectSelect}<label class="terminal-model-search">${icon("search")}<input data-terminal-model-search="${escapeAttribute(target)}" value="${escapeAttribute(query)}" placeholder="Search models" autocomplete="off" /></label><div class="terminal-model-scroll" role="listbox" aria-label="Models">${groups.length ? groups.map((group) => terminalModelSection(group, selectedKey, optionAttribute)).join("") : `<p class="terminal-model-empty">No models found</p>`}</div></div>`;
}
function renderTerminalModelSearchResults(input) {
  const target = input?.dataset?.terminalModelSearch || "";
  if (target !== "setup" && target !== "new") return false;
  const picker = input.closest("[data-terminal-model-picker]");
  const scroller = picker?.querySelector(".terminal-model-scroll");
  if (!picker || !scroller) return false;
  const selectedKey = selectedSetupModel().key;
  const optionAttribute = target === "setup" ? "data-terminal-setup-model" : "data-terminal-new-model";
  const query = target === "setup" ? setupModelSearch : newTerminalModelSearch;
  const groups = filteredTerminalModelGroups(query);
  scroller.innerHTML = groups.length
    ? groups.map((group) => terminalModelSection(group, selectedKey, optionAttribute)).join("")
    : `<p class="terminal-model-empty">No models found</p>`;
  restoreTerminalModelScroll(scroller, target);
  picker.querySelectorAll("[data-terminal-setup-model]").forEach((button) => {
    button.addEventListener("click", () => selectSetupModel(button.dataset.terminalSetupModel || "auto"));
  });
  picker.querySelectorAll("[data-terminal-new-model]").forEach((button) => {
    button.addEventListener("click", () => createTerminalFromModel(button.dataset.terminalNewModel || "auto"));
  });
  return true;
}
function terminalModelSection(group, selectedKey, optionAttribute) {
  const label = terminalProviderGroupLabel(group);
  const title = label === "Auto" ? "Default" : label;
  const headerLogo = group.options[0] ? modelLogo(group.options[0]) : "";
  return `<section class="terminal-model-section" aria-label="${escapeAttribute(title)}"><p class="terminal-model-section-title">${headerLogo}<span>${escapeHtml(title)}</span></p><div class="terminal-model-list">${group.options.map((model) => terminalModelButton(model, selectedKey, optionAttribute)).join("")}</div></section>`;
}
function terminalModelButton(model, selectedKey, optionAttribute, extraClass = "") {
  const locked = typeof modelLocked === "function" && modelLocked(model);
  return `<button class="terminal-model-option ${extraClass} ${selectedKey === model.key ? "active" : ""} ${locked ? "locked" : ""}" type="button" role="option" aria-selected="${selectedKey === model.key ? "true" : "false"}" ${optionAttribute}="${escapeAttribute(model.key)}">${modelLogo(model)}<span><strong>${escapeHtml(model.label)}</strong><small>${escapeHtml(modelHint(model, locked))}</small></span>${locked ? `<em class="terminal-model-lock">${icon("lock")}</em>` : model.badge ? `<em class="terminal-model-badge">${escapeHtml(model.badge)}</em>` : "<i></i>"}</button>`;
}
function terminalModelGroups() {
  const baseGroups = config().chatModelGroups || [];
  const groups = terminalDynamicModelGroups
    ? mergeTerminalModelGroups(baseGroups, terminalDynamicModelGroups)
    : baseGroups;
  return groups.length ? groups : [{ title: "", options: [{ key: "auto", label: "Auto", provider: "auto" }] }];
}

function mergeTerminalModelGroups(...collections) {
  const seen = new Set();
  const groups = [];
  for (const collection of collections) {
    for (const group of collection || []) {
      const options = (group.options || []).filter((model) => {
        const key = String(model?.key || "").trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (options.length) groups.push({ ...group, options });
    }
  }
  return groups;
}
function filteredTerminalModelGroups(query) {
  const normalized = String(query || "").trim().toLowerCase();
  return terminalModelGroups().map((group) => {
    const groupLabel = terminalProviderGroupLabel(group);
    const options = normalized
      ? group.options.filter((model) => [model.label, model.key, model.provider, groupLabel].some((value) => String(value || "").toLowerCase().includes(normalized)))
      : group.options;
    return { ...group, options };
  }).filter((group) => group.options.length);
}
function terminalModelGroupKey(group) {
  if (typeof modelGroupKey === "function") return modelGroupKey(group);
  return group?.options?.find((model) => model.provider !== "auto")?.provider || "auto";
}
function terminalProviderGroupLabel(group) {
  if (group?.company) return group.company;
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
  if (typeof providerLogo === "function") return providerLogo(model?.provider, model?.company);
  return `<span class="provider-logo auto">${icon("sparkles")}</span>`;
}
function modelHint(model, locked) {
  if (locked && typeof modelTier === "function") return `${modelTier(model)} · upgrade`;
  if (model?.provider === "auto") return "Vibyra chooses";
  return model?.company || model?.provider || "OpenRouter";
}
function terminalModelSupportsReasoning(modelOrKey) {
  const model = typeof modelOrKey === "string" ? modelByKey(modelOrKey) : modelOrKey;
  if (typeof model?.supportsReasoning === "boolean") return model.supportsReasoning;
  const key = String(model?.key || model?.modelKey || "").toLowerCase();
  if (!key || key === "auto") return true;
  return /(^|\/)(gpt-5|o\d|claude-(?:opus|sonnet)-4|gemini-2\.5)/.test(key);
}
function terminalReasoningEfforts(modelOrKey) {
  if (!terminalModelSupportsReasoning(modelOrKey)) return [];
  return [
    { value: "low", label: "Low", hint: "Less reasoning" },
    { value: "medium", label: "Medium", hint: "Standard reasoning" },
    { value: "high", label: "High", hint: "More reasoning" },
    { value: "xhigh", label: "Extra high", hint: "Maximum reasoning" }
  ];
}
function terminalEffortForModel(modelOrKey, value) {
  const efforts = terminalReasoningEfforts(modelOrKey);
  if (!efforts.length) return "default";
  const requested = String(value || "medium").toLowerCase();
  return efforts.some((effort) => effort.value === requested) ? requested : "medium";
}
function providerTokenLabelForModel(model) {
  const provider = terminalProviderKeyForModel(model);
  if (provider !== "openai") return "Provider account";
  const account = providerAccounts.openai || {};
  if (!account.connected) return "OpenAI API key";
  return account.source === "env" ? "OpenAI env" : "OpenAI API key";
}
function terminalTokenModeForModel(model, mode) {
  const provider = terminalProviderKeyForModel(model);
  const openai = providerAccounts.openai || {};
  return mode === "provider" && provider === "openai" && openai.connected ? "provider" : "vibyra";
}
function terminalTokenSourcePanel(model, selectedMode, target) {
  const provider = terminalProviderKeyForModel(model);
  const openai = providerAccounts.openai || {};
  const codex = providerAccounts.codex || {};
  const supportsProvider = provider === "openai";
  const canUseProvider = supportsProvider && openai.connected;
  const mode = terminalTokenModeForModel(model, selectedMode);
  const codexLine = supportsProvider ? codexAccountLine(codex) : "";
  const connectedLine = openai.connected
    ? `<span>${escapeHtml(openai.label || "OpenAI API key")}${openai.last4 ? ` · ${escapeHtml(openai.last4)}` : ""}</span><button type="button" data-provider-disconnect ${providerConnectPosting ? "disabled" : ""}>Disconnect</button>`
    : `<span>OpenAI API key not connected</span><button type="button" data-open-provider-connect>${providerConnectOpen ? "Close" : "Connect"}</button>`;
  const providerTitle = !supportsProvider ? "Provider API keys are available for OpenAI models" : canUseProvider ? "Usage bills your OpenAI API account" : "Connect an OpenAI API key before using API-key billing";
  const billingLine = mode === "provider" && canUseProvider ? `<em class="terminal-provider-notice">Usage bills your OpenAI API account.</em>` : "";
  return `<div class="terminal-token-source"><p>Tokens</p>${codexLine}<div class="terminal-token-row" role="group" aria-label="Token source"><button class="${mode !== "provider" ? "active" : ""}" type="button" data-terminal-token-target="${escapeAttribute(target)}" data-terminal-token-mode="vibyra">${icon("sparkles")}<span>Vibyra tokens</span></button><button class="${mode === "provider" ? "active" : ""} ${canUseProvider ? "" : "needs-connect"}" type="button" data-terminal-token-target="${escapeAttribute(target)}" data-terminal-token-mode="provider" title="${escapeAttribute(providerTitle)}">${icon("lock")}<span>OpenAI API key</span></button></div><div class="terminal-provider-row">${connectedLine}</div>${billingLine}${providerConnectOpen ? openAiConnectForm() : ""}${providerConnectNotice ? `<em class="terminal-provider-notice">${escapeHtml(providerConnectNotice)}</em>` : ""}</div>`;
}

function codexAccountLine(codex) {
  if (!codex.available) {
    return `<div class="terminal-provider-row"><span>Codex CLI is not installed</span></div>`;
  }
  if (codex.connected) {
    return `<div class="terminal-provider-row"><span>${escapeHtml(codex.label || "ChatGPT via Codex CLI")}</span></div>`;
  }
  return `<div class="terminal-provider-row"><span>ChatGPT not signed in for Codex CLI</span></div>`;
}

function openAiConnectForm() {
  return `<form class="terminal-provider-form" data-provider-connect-form><label><span>API key</span><input name="apiKey" type="password" autocomplete="off" placeholder="sk-..." required /></label><label><span>Organization</span><input name="organization" autocomplete="off" placeholder="optional" /></label><label><span>Project</span><input name="project" autocomplete="off" placeholder="optional" /></label><button type="submit" ${providerConnectPosting ? "disabled" : ""}>${providerConnectPosting ? "Connecting" : "Connect API key"}</button></form>`;
}
function modelMetaChip(terminal) {
  const model = terminalModelForDisplay(terminal.model);
  return `<span class="terminal-meta-chip terminal-model-chip">${modelLogo(model)}${escapeHtml(model.label)}</span>`;
}
function isUsageLimit(error) {
  const message = String(error?.message || "").toLowerCase();
  return Number(error?.status) === 429 || message.includes("cap reached") || message.includes("usage limit") || message.includes("rate limit");
}

async function loadTerminalOpenRouterModels() {
  try {
    const response = await fetch("/desktop/openrouter-models");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(payload.groups)) return;
    applyTerminalOpenRouterModels(payload.groups);
  } catch {}
}

function applyTerminalOpenRouterModels(groups) {
  const nextGroups = groups.map(normalizeTerminalModelGroup).filter((group) => group.options.length);
  if (!nextGroups.length) return;
  terminalDynamicModelGroups = nextGroups;
  for (const model of nextGroups.flatMap((group) => group.options)) modelTiers[model.key] = model.tier || modelTiers[model.key] || "balanced";
  if (!modelChoices().some((model) => model.key === setupModel)) setupModel = "auto";
  if (activePage === "terminals" || openChatMenu === "ai") render();
}

function normalizeTerminalModelGroup(group) {
  const company = String(group?.company || group?.title || "").trim();
  const options = Array.isArray(group?.options) ? group.options.map((model) => normalizeTerminalModel(model, company)).filter(Boolean) : [];
  return { title: company || group?.title || "", company, options };
}

function normalizeTerminalModel(model, company) {
  const key = String(model?.key || "").trim();
  if (!key) return null;
  return {
    key,
    modelKey: String(model?.modelKey || key),
    label: String(model?.label || key).slice(0, 96),
    provider: String(model?.provider || "openrouter").trim() || "openrouter",
    company: String(model?.company || company || "").trim(),
    tier: String(model?.tier || "balanced").trim() || "balanced",
    badge: String(model?.badge || "").slice(0, 24),
    supportsReasoning: Boolean(model?.supportsReasoning)
  };
}

window.addEventListener("load", () => setTimeout(loadTerminalOpenRouterModels, 0));
window.addEventListener("load", () => setTimeout(loadProviderAccounts, 0));

async function loadProviderAccounts() {
  try {
    const response = await fetch("/desktop/provider-accounts");
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.providers) providerAccounts = payload.providers;
    if (activePage === "terminals") render();
  } catch {}
}
