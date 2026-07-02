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
  const qualified = value.includes("/");
  if (provider === "claude" || provider === "anthropic" || company.includes("anthropic") || value.startsWith("anthropic/") || value.startsWith("claude-")) return "claude";
  if (provider === "gemini" || provider === "google" || company.includes("google") || value.startsWith("google/") || value.startsWith("gemini-")) return "gemini";
  if (
    provider === "openai"
    || company.includes("openai")
    || value.startsWith("openai/")
    || !qualified && (value.startsWith("gpt-") || value.includes("codex"))
  ) return "openai";
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
function terminalModelLocked(model, mode = setupTokenMode) {
  const tokenMode = terminalTokenModeForModel(model, mode);
  return tokenMode === "vibyra"
    && typeof modelLocked === "function"
    && modelLocked(model);
}
function unlockedModel(key, mode = setupTokenMode) {
  const model = modelByKey(key);
  if (terminalModelLocked(model, mode)) {
    const fallback = terminalFirstModelForTokenMode(mode);
    if (fallback) return fallback;
    if (typeof firstUnlockedModel === "function") return modelByKey(firstUnlockedModel());
  }
  return model;
}
function selectedSetupModel() {
  const model = unlockedModel(setupModel, setupTokenMode);
  setupModel = model.key;
  setupEffort = terminalEffortForModel(model, setupEffort);
  return model;
}
function selectSetupModel(key) {
  const model = modelByKey(key);
  const tokenMode = terminalTokenModeForModel(model, setupTokenMode);
  if (terminalModelLocked(model, tokenMode)) {
    if (typeof openTokenModal === "function") openTokenModal("plans");
    return;
  }
  if (!terminalModelAvailableForTokenMode(model, tokenMode)) {
    providerConnectNotice = terminalTokenSourceIssue(model, tokenMode);
    render();
    return;
  }
  const runtimeIssue = typeof terminalRuntimeLaunchIssue === "function"
    ? terminalRuntimeLaunchIssue(model, tokenMode)
    : "";
  if (runtimeIssue && String(model.key || "").toLowerCase() !== "auto") {
    terminalRuntimeNotice = runtimeIssue;
    render();
    return;
  }
  setupModel = model.key;
  setupTokenMode = tokenMode;
  setupEffort = terminalEffortForModel(model, setupEffort);
  localStorage.setItem(setupModelKey, setupModel);
  localStorage.setItem(setupEffortKey, setupEffort);
  localStorage.setItem("vibyra.desktop.terminalTokenMode", setupTokenMode);
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
  const tokenMode = terminalTokenModeForModel(model, setupTokenMode);
  if (terminalModelLocked(model, tokenMode)) {
    newTerminalMenuOpen = false;
    if (typeof openTokenModal === "function") openTokenModal("plans");
    render();
    return;
  }
  const runtimeIssue = typeof terminalRuntimeLaunchIssue === "function"
    ? terminalRuntimeLaunchIssue(model, tokenMode)
    : "";
  if (runtimeIssue) {
    terminalRuntimeNotice = runtimeIssue;
    render();
    return;
  }
  newTerminalModelSearch = "";
  terminalProjectMenuTarget = "";
  createTerminal(model.key, true, {
    effort: terminalEffortForModel(model, setupEffort),
    permissionMode: typeof terminalPermissionModeForSetup === "function"
      ? terminalPermissionModeForSetup(model, tokenMode)
      : "standard",
    tokenMode
  });
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
  const notice = terminalRuntimeNotice ? `<em class="terminal-model-cli-notice">${escapeHtml(terminalRuntimeNotice)}</em>` : "";
  const quickList = query ? "" : terminalModelQuickList(groups, selectedKey, optionAttribute);
  return `<div class="terminal-menu terminal-model-picker" data-terminal-model-picker="${escapeAttribute(target)}">${projectSelect}${terminalModelPickerHeader(groups)}<label class="terminal-model-search">${icon("search")}<input data-terminal-model-search="${escapeAttribute(target)}" value="${escapeAttribute(query)}" placeholder="Search models" autocomplete="off" /></label>${notice}<div class="terminal-model-quick-list" data-terminal-model-quick ${quickList ? "" : "hidden"}>${quickList}</div><div class="terminal-model-scroll" role="listbox" aria-label="Models">${groups.length ? groups.map((group) => terminalModelSection(group, selectedKey, optionAttribute)).join("") : `<p class="terminal-model-empty">No models found</p>`}</div></div>`;
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
  const quick = picker.querySelector("[data-terminal-model-quick]");
  const count = picker.querySelector("[data-terminal-model-count]");
  if (quick) {
    quick.innerHTML = query ? "" : terminalModelQuickList(groups, selectedKey, optionAttribute);
    quick.hidden = Boolean(query || !quick.innerHTML);
  }
  if (count) count.textContent = terminalModelCountLabel(groups);
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
  if (typeof bindTerminalRuntimeControls === "function") bindTerminalRuntimeControls(picker);
  return true;
}
function terminalModelPickerHeader(groups) {
  const source = setupTokenMode === "provider" ? "My AI accounts" : "Vibyra tokens";
  return `<div class="terminal-model-picker-head"><span><strong>AI model</strong><small>${escapeHtml(source)}</small></span><em data-terminal-model-count>${terminalModelCountLabel(groups)}</em></div>`;
}
function terminalModelCountLabel(groups) {
  const count = groups.reduce((total, group) => total + group.options.length, 0);
  return `${count} model${count === 1 ? "" : "s"}`;
}
function terminalModelQuickList(groups, selectedKey, optionAttribute) {
  const quick = terminalModelQuickOptions(groups, selectedKey);
  return quick.map((model) => terminalModelQuickButton(model, selectedKey, optionAttribute)).join("");
}
function terminalModelQuickOptions(groups, selectedKey) {
  const selected = groups.flatMap((group) => group.options).find((model) => model.key === selectedKey);
  const candidates = [
    selected,
    ...groups.map((group) => group.options[0])
  ].filter(Boolean);
  const seen = new Set();
  return candidates.filter((model) => {
    if (seen.has(model.key)) return false;
    seen.add(model.key);
    return true;
  }).slice(0, 3);
}
function terminalModelQuickButton(model, selectedKey, optionAttribute) {
  const tokenMode = terminalTokenModeForModel(model, setupTokenMode);
  const locked = terminalModelLocked(model, tokenMode);
  const launch = typeof terminalRuntimePickerState === "function"
    ? terminalRuntimePickerState(model, tokenMode)
    : typeof terminalRuntimeLaunchState === "function"
      ? terminalRuntimeLaunchState(model, tokenMode)
    : { available: true, issue: "" };
  const selected = selectedKey === model.key;
  return `<button class="terminal-model-quick ${selected ? "active" : ""} ${locked ? "locked" : ""}" type="button" title="${launch.available ? "" : escapeAttribute(launch.issue)}" ${launch.available ? "" : "disabled"} ${optionAttribute}="${escapeAttribute(model.key)}">${modelLogo(model)}<span><strong>${escapeHtml(model.label)}</strong><small>${selected ? "Current" : escapeHtml(modelHint(model, locked))}</small></span></button>`;
}
function terminalModelSection(group, selectedKey, optionAttribute) {
  const label = terminalProviderGroupLabel(group);
  const title = label === "Auto" ? "Default" : label;
  return `<section class="terminal-model-section" aria-label="${escapeAttribute(title)}"><p class="terminal-model-section-title"><span>${escapeHtml(title)}</span><em>${group.options.length}</em></p><div class="terminal-model-list">${group.options.map((model) => terminalModelButton(model, selectedKey, optionAttribute)).join("")}</div></section>`;
}
function terminalModelButton(model, selectedKey, optionAttribute, extraClass = "") {
  const tokenMode = terminalTokenModeForModel(model, setupTokenMode);
  const locked = terminalModelLocked(model, tokenMode);
  const launch = typeof terminalRuntimePickerState === "function"
    ? terminalRuntimePickerState(model, tokenMode)
    : typeof terminalRuntimeLaunchState === "function"
      ? terminalRuntimeLaunchState(model, tokenMode)
    : { available: true, issue: "", surface: "native", label: "Native CLI" };
  const unavailable = !launch.available;
  const runtimeUi = typeof terminalModelCliControl === "function"
    ? terminalModelCliControl(model, tokenMode)
    : "";
  const download = launch.surface === "download" ? runtimeUi : "";
  const status = launch.surface === "download" ? "" : runtimeUi;
  const disabled = unavailable;
  const fallbackMeta = model.badge ? `<em class="terminal-model-badge">${escapeHtml(model.badge)}</em>` : "";
  const meta = `<span class="terminal-model-option-meta">${locked ? `<em class="terminal-model-lock">${icon("lock")}</em>` : ""}${status || fallbackMeta}</span>`;
  return `<div class="terminal-model-option-row"><button class="terminal-model-option ${extraClass} ${selectedKey === model.key ? "active" : ""} ${locked ? "locked" : ""} ${unavailable ? "unavailable" : ""}" type="button" role="option" aria-selected="${selectedKey === model.key ? "true" : "false"}" aria-disabled="${disabled ? "true" : "false"}" title="${unavailable ? escapeAttribute(launch.issue) : ""}" ${disabled ? "disabled" : ""} ${optionAttribute}="${escapeAttribute(model.key)}">${modelLogo(model)}<span><strong>${escapeHtml(model.label)}</strong><small>${escapeHtml(modelHint(model, locked))}</small></span>${meta}</button>${download}</div>`;
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
    const providerModeOnly = setupTokenMode === "provider";
    const options = group.options.filter((model) => {
      if (providerModeOnly && !terminalModelSupportsProviderLogin(model)) return false;
      return !normalized
        || [model.label, model.key, model.provider, groupLabel].some((value) => String(value || "").toLowerCase().includes(normalized));
    });
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
  return terminalModelProviderLabel(model) || "OpenRouter";
}
function terminalModelProviderLabel(model) {
  if (model?.company) return model.company;
  const provider = terminalProviderKeyForModel(model);
  if (provider === "openai") return "OpenAI";
  if (provider === "claude" || provider === "anthropic") return "Anthropic";
  if (provider === "gemini" || provider === "google") return "Google";
  if (provider === "x-ai" || provider === "xai") return "xAI";
  if (provider === "qwen") return "Qwen";
  if (provider === "kimi" || provider === "moonshot") return "Moonshot";
  if (provider === "mistral") return "Mistral";
  if (provider === "deepseek") return "DeepSeek";
  return model?.provider || "";
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
  return terminalOwnAccountRoute(model).label || "My AI account";
}
function terminalTokenModeForModel(model, mode) {
  return ["vibyra", "provider"].includes(mode) ? mode : "vibyra";
}
function terminalOwnAccountRoute(model) {
  const provider = terminalProviderKeyForModel(model);
  const nativeRuntime = typeof terminalNativeRuntimeForModel === "function"
    ? terminalNativeRuntimeForModel(model)
    : provider === "openai"
      ? "codex"
      : ["claude", "gemini"].includes(provider) ? provider : "";
  const codex = providerAccounts.codex || {};
  const nativeAccount = provider === "claude"
    ? providerAccounts.claude || {}
    : provider === "gemini"
      ? providerAccounts.gemini || {}
      : null;
  if (nativeRuntime === "codex" && codex.available && codex.connected) {
    return { available: true, agent: "codex", label: codex.label || "ChatGPT via Codex CLI" };
  }
  if (nativeRuntime === "codex" && !codex.available) {
    return { available: false, agent: "", label: "", reason: "Your OpenAI account is not ready for this model." };
  }
  if (nativeRuntime === "codex") {
    return { available: false, agent: "", label: "", reason: "Your OpenAI account is not ready for this model." };
  }
  if (nativeAccount && nativeRuntime && nativeAccount.available && nativeAccount.connected) {
    return {
      available: true,
      agent: provider,
      label: nativeAccount.label || (provider === "claude" ? "Claude Code" : "Gemini CLI")
    };
  }
  if (nativeAccount && nativeRuntime) {
    return {
      available: false,
      agent: "",
      label: "",
      reason: `Your ${provider === "claude" ? "Claude" : "Gemini"} account is not ready for this model.`
    };
  }
  return { available: false, agent: "", label: "", reason: "This model is only available with Vibyra tokens." };
}
function terminalModelSupportsProviderLogin(model) {
  const runtime = typeof terminalNativeRuntimeForModel === "function"
    ? terminalNativeRuntimeForModel(model)
    : terminalProviderLoginRuntimeForModel(model);
  return ["codex", "claude", "gemini"].includes(runtime);
}
function terminalProviderLoginRuntimeForModel(model) {
  const key = String(model?.modelKey || model?.key || "").trim().toLowerCase();
  const provider = terminalProviderKeyForModel(model);
  const modelName = key.includes("/") ? key.split("/", 2)[1] : key;
  if ((provider === "openai" || !key.includes("/")) && /^(gpt-|codex|o1|o3|o4|chatgpt-)/.test(modelName)) return "codex";
  if ((provider === "claude" || provider === "anthropic" || !key.includes("/")) && modelName.startsWith("claude-")) return "claude";
  if ((provider === "gemini" || provider === "google" || !key.includes("/")) && modelName.startsWith("gemini-")) return "gemini";
  return "";
}
function terminalModelAvailableForTokenMode(model, mode) {
  return mode !== "provider" || terminalOwnAccountRoute(model).available;
}
function terminalFirstModelForTokenMode(mode) {
  return modelChoices().find((model) =>
    terminalModelAvailableForTokenMode(model, mode)
    && !terminalModelLocked(model, mode)
  ) || null;
}
function terminalTokenSourceIssue(model, mode) {
  if (mode !== "provider") return "";
  return terminalOwnAccountRoute(model).reason || "";
}
function terminalTokenSourcePanel(model, selectedMode, target) {
  const mode = terminalTokenModeForModel(model, selectedMode);
  const route = terminalOwnAccountRoute(model);
  const issue = terminalTokenSourceIssue(model, mode);
  const notice = providerConnectNotice || issue;
  return `<div class="terminal-token-source"><p>Pay with</p><div class="terminal-token-row" role="group" aria-label="Token source"><button class="${mode === "vibyra" ? "active" : ""}" type="button" data-terminal-token-target="${escapeAttribute(target)}" data-terminal-token-mode="vibyra">${icon("sparkles")}<span><strong>Vibyra tokens</strong><small>Uses your Vibyra credits</small></span></button><button class="${mode === "provider" ? "active" : ""} ${route.available ? "" : "needs-connect"}" type="button" data-terminal-token-target="${escapeAttribute(target)}" data-terminal-token-mode="provider">${icon("lock")}<span><strong>My AI accounts</strong><small>Uses your connected subscription</small></span></button></div>${notice ? `<em class="terminal-provider-notice">${escapeHtml(notice)}</em>` : ""}<button class="terminal-manage-ai-accounts" type="button" data-open-ai-accounts>Manage AI accounts</button></div>`;
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
  const cached = await fetchTerminalOpenRouterModels("/desktop/openrouter-models");
  if (cached) applyTerminalOpenRouterModels(cached);
  const fresh = await fetchTerminalOpenRouterModels("/desktop/openrouter-models?refresh=1");
  if (fresh) applyTerminalOpenRouterModels(fresh);
}

async function fetchTerminalOpenRouterModels(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(payload.groups)) return null;
    return payload.groups;
  } catch {
    return null;
  }
}

function applyTerminalOpenRouterModels(groups) {
  const nextGroups = groups
    .map(normalizeTerminalModelGroup)
    .map((group) => ({
      ...group,
      options: group.options.filter(terminalOpenRouterModelAllowed)
    }))
    .filter((group) => group.options.length);
  if (!nextGroups.length) return;
  terminalDynamicModelGroups = nextGroups;
  for (const model of nextGroups.flatMap((group) => group.options)) modelTiers[model.key] = model.tier || modelTiers[model.key] || "balanced";
  if (!modelChoices().some((model) => model.key === setupModel)) {
    setupModel = terminalOfficialFallbackModelKey(setupModel);
    localStorage.setItem(setupModelKey, setupModel);
  }
  if (activePage === "terminals" || openChatMenu === "ai") render();
}

function terminalOpenRouterModelAllowed(model) {
  if (String(model?.key || "").includes("/")) return true;
  const runtime = typeof terminalNativeRuntimeForModel === "function"
    ? terminalNativeRuntimeForModel(model)
    : "";
  return !["codex", "claude", "gemini"].includes(runtime);
}

function terminalOfficialFallbackModelKey(key) {
  const provider = terminalProviderKeyForModel(key);
  const fallback = modelChoices().find((model) =>
    !String(model?.modelKey || model?.key || "").includes("/")
    && terminalProviderKeyForModel(model) === provider
  );
  return fallback?.key || "auto";
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
