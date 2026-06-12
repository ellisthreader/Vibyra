let profileAiAccounts = {};
let profileAiAccountsBusy = "";
let profileAiAccountsError = "";
let profileAiAccountsLoaded = false;
let profileAiAccountsPoll = 0;

const profileAiAccountDefinitions = [
  { key: "codex", provider: "openai", name: "OpenAI", runtime: "Codex CLI" },
  { key: "claude", provider: "claude", name: "Anthropic", runtime: "Claude Code" },
  { key: "gemini", provider: "gemini", name: "Google", runtime: "Gemini CLI" }
];
const profileAiAccountStatuses = new Set(["connected", "connecting", "error", "sign-in-required", "not-installed"]);

function settingsAiAccountsSection() {
  const rows = profileAiAccountDefinitions.map(profileAiAccountRow).join("");
  return `${settingsHeader("AI accounts", "Use your existing AI subscriptions in native Vibyra terminals.")}
    <section class="profile-ai-accounts" aria-label="Connected AI accounts">
      <div class="profile-ai-accounts-note">${icon("shield")}<span>Provider sign-in stays inside each official CLI. Vibyra never asks for or stores API keys.</span></div>
      <div class="profile-ai-account-list">${rows}</div>
      ${profileAiAccountsError ? `<p class="profile-status profile-status--danger" role="status">${escapeHtml(profileAiAccountsError)}</p>` : ""}
    </section>`;
}

function profileAiAccountRow(definition) {
  const account = profileAiAccounts[definition.key] || {
    available: false,
    connected: false,
    status: profileAiAccountsLoaded ? "not-installed" : "loading",
    detail: profileAiAccountsLoaded ? "Install the official CLI to connect." : "Checking this computer..."
  };
  const busy = profileAiAccountsBusy === definition.key;
  const status = profileAiAccountStatus(account);
  const action = profileAiAccountAction(definition, account, busy);
  const models = profileAiAccountModels(definition);
  return `<article class="profile-ai-account-row" data-ai-account="${definition.key}">
    <span class="profile-ai-account-logo">${providerLogo(definition.provider)}</span>
    <div class="profile-ai-account-copy"><div><strong>${definition.name}</strong><span>${definition.runtime}</span></div>
      <p>${escapeHtml(account.accountLabel || account.detail || status.label)}</p>
      ${models.length ? `<div class="profile-ai-account-models" aria-label="${escapeAttribute(definition.name)} supported models">${models.map((model) => `<span>${escapeHtml(model.label)}</span>`).join("")}</div>` : ""}</div>
    <span class="profile-ai-account-status profile-ai-account-status--${status.tone}"><i></i>${escapeHtml(status.label)}</span>
    <div class="profile-ai-account-action">${action}</div>
  </article>`;
}

function profileAiAccountStatus(account) {
  if (account.status === "connected") return { label: "Connected", tone: "success" };
  if (account.status === "connecting") return { label: "Connecting", tone: "working" };
  if (account.status === "error") return { label: "Needs attention", tone: "danger" };
  if (account.status === "loading") return { label: "Checking", tone: "muted" };
  if (account.status === "not-installed") return { label: "Not installed", tone: "muted" };
  return { label: "Sign in required", tone: "muted" };
}

function profileAiAccountAction(definition, account, busy) {
  if (account.status === "loading") return "";
  if (account.status === "connecting") {
    const open = account.loginUrl
      ? `<button class="primary-button compact-button" type="button" data-profile-action="ai-account-open-url" data-profile-value="${escapeAttribute(account.loginUrl)}">Open sign-in page</button>`
      : "";
    return `${open}<button class="secondary-button compact-button" type="button" data-profile-action="ai-account-cancel" data-ai-provider="${definition.key}" ${busy ? "disabled" : ""}>Cancel</button>`;
  }
  if (account.status === "connected" && account.connected) {
    return `<button class="profile-ai-account-link" type="button" data-profile-action="ai-account-disconnect" data-ai-provider="${definition.key}" ${busy ? "disabled" : ""}>${busy ? "Disconnecting..." : "Disconnect"}</button>`;
  }
  const label = account.available ? (account.status === "error" ? "Try again" : "Sign in") : "Install";
  return `<button class="primary-button compact-button" type="button" data-profile-action="ai-account-login" data-ai-provider="${definition.key}" ${busy ? "disabled" : ""}>${busy ? "Opening..." : label}</button>`;
}

async function loadProfileAiAccounts(force = false) {
  if (profileAiAccountsBusy === "load" || (profileAiAccountsLoaded && !force)) return;
  profileAiAccountsBusy = "load";
  try {
    const response = await fetch("/desktop/provider-accounts");
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.providers) throw new Error(result.error || "AI accounts could not be loaded.");
    profileAiAccounts = normalizeProfileAiAccounts(result.providers);
    profileAiAccountsLoaded = true;
    profileAiAccountsError = "";
    if (typeof providerAccounts !== "undefined") providerAccounts = profileAiAccounts;
  } catch (error) {
    profileAiAccountsError = profileAiAccountErrorMessage(error, "AI accounts could not be loaded.");
  } finally {
    profileAiAccountsBusy = "";
    if (profileActiveSection === "ai-accounts") renderProfile();
    scheduleProfileAiAccountsPoll();
  }
}

async function changeProfileAiAccount(provider, action) {
  if (profileAiAccountsBusy) return;
  profileAiAccountsBusy = provider;
  profileAiAccountsError = "";
  renderProfile();
  try {
    let account = profileAiAccounts[provider] || {};
    if (action === "login" && !account.available) {
      const install = await fetch(`/desktop/terminal-runtimes/${encodeURIComponent(provider)}/install`, { method: "POST" });
      const installed = await install.json().catch(() => ({}));
      if (!install.ok) throw new Error(installed.error || `Could not install ${account.label || "the official CLI"}.`);
    }
    const response = await fetch(`/desktop/provider-accounts/${encodeURIComponent(provider)}/${action}`, { method: "POST" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.error || "The AI account could not be updated.");
    profileAiAccounts = result.providers ? normalizeProfileAiAccounts(result.providers) : profileAiAccounts;
    profileAiAccountsLoaded = true;
    if (typeof providerAccounts !== "undefined") providerAccounts = profileAiAccounts;
  } catch (error) {
    profileAiAccountsError = profileAiAccountErrorMessage(error, "The AI account could not be updated.");
  } finally {
    profileAiAccountsBusy = "";
    renderProfile();
    scheduleProfileAiAccountsPoll();
  }
}

function scheduleProfileAiAccountsPoll() {
  clearTimeout(profileAiAccountsPoll);
  const connecting = Object.values(profileAiAccounts).some((account) => account?.status === "connecting");
  if (!profileModalOpen || profileActiveSection !== "ai-accounts" || !connecting) return;
  profileAiAccountsPoll = setTimeout(() => loadProfileAiAccounts(true), 1500);
}

function openAiAccountsSettings(opener = document.activeElement) {
  openProfileModal("ai-accounts", opener);
}

function normalizeProfileAiAccounts(providers = {}) {
  return Object.fromEntries(profileAiAccountDefinitions.map((definition) => {
    const raw = providers[definition.key] || (definition.key === "codex" ? providers.openai : null) || {};
    const explicitStatus = String(raw.status || "").trim();
    const status = profileAiAccountStatuses.has(explicitStatus)
      ? explicitStatus
      : raw.connected ? "connected" : raw.available ? "sign-in-required" : "not-installed";
    const connected = status === "connected";
    return [definition.key, {
      ...raw,
      provider: definition.key,
      runtime: raw.runtime || definition.key,
      label: raw.label || definition.name,
      available: Boolean(raw.available || connected),
      connected,
      status,
      accountLabel: String(raw.accountLabel || (connected ? raw.label || "" : "")),
      detail: String(raw.detail || ""),
      loginUrl: String(raw.loginUrl || "")
    }];
  }));
}

function profileAiAccountModels(definition) {
  const models = profileAiAccountModelChoices().filter((model) => {
    const runtime = profileAiAccountRuntimeForModel(model);
    return runtime === definition.key;
  });
  return profileUniqueModels(models).slice(0, 8);
}

function profileAiAccountModelChoices() {
  const groups = typeof config === "function"
    ? config().chatModelGroups || []
    : typeof window !== "undefined" ? window.vibyraDesktopChatConfig?.chatModelGroups || [] : [];
  return groups.flatMap((group) => Array.isArray(group?.options) ? group.options : [])
    .filter((model) => model && String(model.key || "").trim() && String(model.key || "").trim() !== "auto");
}

function profileAiAccountRuntimeForModel(model) {
  if (typeof terminalNativeRuntimeForModel === "function") return terminalNativeRuntimeForModel(model);
  const key = String(model?.modelKey || model?.key || "").trim().toLowerCase();
  const provider = String(model?.provider || "").trim().toLowerCase();
  const modelName = key.includes("/") ? key.split("/", 2)[1] : key;
  if ((provider === "openai" || !key.includes("/")) && /^(gpt-|codex|o1|o3|o4|chatgpt-)/.test(modelName)) return "codex";
  if ((provider === "claude" || provider === "anthropic" || !key.includes("/")) && modelName.startsWith("claude-")) return "claude";
  if ((provider === "gemini" || provider === "google" || !key.includes("/")) && modelName.startsWith("gemini-")) return "gemini";
  return "";
}

function profileUniqueModels(models) {
  const seen = new Set();
  return models.filter((model) => {
    const key = String(model.key || model.modelKey || "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function profileAiAccountErrorMessage(error, fallback) {
  const message = error instanceof Error ? error.message : fallback;
  return /Missing or invalid desktop token/i.test(message)
    ? "AI account linking needs the refreshed Vibyra Desktop bridge. Restart Vibyra Desktop and try again."
    : message;
}
