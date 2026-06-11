function chatActionMenu() {
  const chat = activeChat();
  const disabled = chat ? "" : "disabled";
  const pinLabel = chat?.pinned ? "Unpin chat" : "Pin chat";
  return `<div class="topbar-menu chat-actions-menu" role="menu"><button type="button" data-chat-action="pin" ${disabled}>${icon("pin")}<span>${pinLabel}</span></button><button type="button" data-chat-action="archive" ${disabled}>${icon("archive")}<span>Archive chat</span></button><button type="button" data-chat-action="rename" ${disabled}>${icon("edit")}<span>Rename chat</span></button><button type="button" data-chat-action="share" ${disabled}>${icon("share")}<span>Share chat</span></button><button class="danger" type="button" data-chat-action="delete" ${disabled}>${icon("trash")}<span>Delete chat</span></button></div>`;
}
async function handleChatAction(action) {
  const chat = activeChat();
  topbarChatMenuOpen = false;
  if (!chat) { render(); return; }
  if (action === "pin") {
    chat.pinned = !chat.pinned;
    chat.updatedAt = Date.now();
    saveDesktopChats();
    render();
    return;
  }
  if (action === "archive") {
    chat.archived = true;
    chat.updatedAt = Date.now();
    saveDesktopChats();
    startNewChat();
    return;
  }
  if (action === "rename") {
    const nextTitle = window.prompt("Rename chat", chat.title || "New chat");
    if (nextTitle === null) { render(); return; }
    const title = nextTitle.replace(/\s+/g, " ").trim();
    if (title) {
      chat.title = title.slice(0, 80);
      chat.updatedAt = Date.now();
      saveDesktopChats();
    }
    render();
    return;
  }
  if (action === "share") {
    await copyText(chatShareText(chat));
    render();
    return;
  }
  if (action === "delete") {
    if (!window.confirm("Delete this chat?")) { render(); return; }
    recentChats = recentChats.filter((item) => item.id !== chat.id);
    saveDesktopChats();
    startNewChat();
  }
}
function chatShareText(chat) {
  const directory = chatDirectoryLabel();
  const lines = (chat.messages || []).map((message) => `${message.role === "assistant" ? "Vibyra" : "You"}: ${message.text}`);
  return [`${chat.title || "New chat"}`, directory, "", ...lines].join("\n").trim();
}
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {}
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}
function attachMenu() {
  const primaryRows = chatAttachmentPrimaryActions.map((action) => `<button class="attach-menu-row" type="button" data-attach-kind="${escapeAttribute(action.kind)}"><span class="attach-row-icon">${icon(action.icon)}</span><span><strong>${escapeHtml(action.label)}</strong><small>${escapeHtml(action.hint)}</small></span></button>`).join("");
  const toolRows = chatAttachmentTools.map((tool) => `<button class="attach-menu-row ${activeChatTool === tool.tool ? "active" : ""}" type="button" data-chat-tool="${escapeAttribute(tool.tool)}"><span class="attach-row-icon">${icon(tool.icon)}</span><span><strong>${escapeHtml(tool.label)}</strong><small>${escapeHtml(tool.description)}</small></span></button>`).join("");
  return `<div class="composer-menu attach-menu">${primaryRows}${toolRows}${chatAttachments.length || activeChatTool ? `<button class="attach-menu-row attach-clear" type="button" data-attach-kind="clear">${icon("close")}<span><strong>Clear</strong><small>Remove staged context</small></span></button>` : ""}</div>`;
}
function aiMenu() {
  const autoModel = chatModels.find((model) => model.provider === "auto");
  const groups = chatModelGroups.filter((group) => modelGroupKey(group) !== "auto");
  const activeGroup = activeModelGroup();
  const activeKey = modelGroupKey(activeGroup);
  const modelButton = (model, extraClass = "") => {
    const locked = modelLocked(model);
    const selected = currentChatModel().key === model.key;
    const detail = locked ? `${model.hint || providerGroupLabel({ options: [model] })} · Upgrade` : model.hint || providerGroupLabel({ options: [model] });
    return `<button class="${extraClass} ${selected ? "active" : ""} ${locked ? "locked" : ""}" type="button" data-model="${escapeAttribute(model.key)}">${providerLogo(model.provider)}<span><strong>${escapeHtml(model.label)}</strong><small>${escapeHtml(detail)}</small></span>${selected ? `<span class="model-selected">${icon("check")}</span>` : locked ? `<em class="lock-tag">${icon("lock")}Upgrade</em>` : model.badge ? `<em>${escapeHtml(model.badge)}</em>` : ""}</button>`;
  };
  const effortButtons = chatEfforts.map((effort) => `<button class="${reasoningEffort === effort.value ? "active" : ""}" type="button" data-effort="${escapeAttribute(effort.value)}" title="${escapeAttribute(effort.hint)}"><span>${escapeHtml(effort.label)}</span></button>`).join("");
  return `<div class="composer-menu model-menu model-picker ai-picker"><header class="ai-picker-head"><div><strong>Choose AI</strong><small>Model and response style</small></div></header>${autoModel ? `<div class="model-picker-current">${modelButton(autoModel, "model-auto-row")}</div>` : ""}<div class="model-provider-tabs" role="tablist" aria-label="Model providers">${groups.map((group) => `<button class="${activeKey === modelGroupKey(group) ? "active" : ""}" type="button" data-model-group="${escapeAttribute(modelGroupKey(group))}" aria-pressed="${activeKey === modelGroupKey(group) ? "true" : "false"}">${providerLogo(modelGroupKey(group))}<span>${escapeHtml(providerGroupLabel(group))}</span></button>`).join("")}</div><section class="model-picker-options" aria-label="${escapeAttribute(providerGroupLabel(activeGroup))} models">${activeGroup.options.map((model) => modelButton(model)).join("")}</section><footer class="ai-effort"><div class="ai-effort-copy"><strong>Response mode</strong><small>${escapeHtml(currentEffort().hint)}</small></div><div class="ai-effort-options" role="group" aria-label="Response mode">${effortButtons}</div></footer></div>`;
}
function providerLogo(provider, company = "") {
  const logo = providerLogoSource(provider, company);
  if (logo) return `<span class="provider-logo ${escapeAttribute(providerLogoClass(provider, company))}"><img src="${escapeAttribute(logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" /></span>`;
  if (provider === "auto") return `<span class="provider-logo auto">${icon("sparkles")}</span>`;
  return `<span class="provider-logo provider-logo-fallback"><strong>${escapeHtml(providerInitials(company || provider))}</strong></span>`;
}

function providerLogoSource(provider, company = "") {
  const key = providerLogoKey(provider, company);
  const simpleSlug = providerSimpleIconSlugs[key];
  if (simpleSlug) return `https://cdn.simpleicons.org/${simpleSlug}?viewbox=auto`;
  return providerLogoSources[key] || "";
}

const providerSimpleIconSlugs = {
  anthropic: "anthropic",
  baidu: "baidu",
  bytedance: "bytedance",
  deepseek: "deepseek",
  gemini: "googlegemini",
  meta: "meta",
  minimax: "minimax",
  mistral: "mistralai",
  nvidia: "nvidia",
  openrouter: "openrouter",
  perplexity: "perplexity",
  qwen: "qwen",
  xai: "x",
  xiaomi: "xiaomi"
};

const providerLogoSources = {
  microsoft: "https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg",
  openai: "https://upload.wikimedia.org/wikipedia/commons/6/66/OpenAI_logo_2025_%28symbol%29.svg"
};

function providerLogoKey(provider, company = "") {
  const value = `${company || ""} ${provider || ""}`.toLowerCase();
  if (provider === "auto" || value.includes("auto")) return "auto";
  if (provider === "openai" || value.includes("openai")) return "openai";
  if (provider === "claude" || value.includes("anthropic") || value.includes("claude")) return "anthropic";
  if (provider === "gemini" || value.includes("google") || value.includes("gemini")) return "gemini";
  if (value.includes("deepseek")) return "deepseek";
  if (value.includes("qwen")) return "qwen";
  if (value.includes("mistral")) return "mistral";
  if (value.includes("perplexity")) return "perplexity";
  if (value.includes("xai") || value.includes("x-ai")) return "xai";
  if (value.includes("meta")) return "meta";
  if (value.includes("nvidia")) return "nvidia";
  if (value.includes("microsoft")) return "microsoft";
  if (value.includes("baidu")) return "baidu";
  if (value.includes("bytedance")) return "bytedance";
  if (value.includes("xiaomi")) return "xiaomi";
  if (value.includes("openrouter")) return "openrouter";
  if (value.includes("minimax")) return "minimax";
  return normalizeProviderLogoKey(company || provider);
}

function providerLogoClass(provider, company = "") {
  return `provider-${providerLogoKey(provider, company).replace(/[^a-z0-9_-]/gi, "-")}`;
}

function providerInitials(value) {
  const words = String(value || "AI").replace(/[^a-z0-9]+/gi, " ").trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 2).map((word) => word[0]).join("") : (words[0] || "AI").slice(0, 2)).toUpperCase();
}

function normalizeProviderLogoKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function openAttachmentPicker(kind) {
  const input = document.getElementById("chat-attach");
  if (!input) return;
  openChatMenu = "";
  if (kind === "clear") { chatAttachments = []; chatImageAttachments = []; activeChatTool = ""; activeChatSkill = ""; renderChat(); return; }
  input.value = "";
  if (kind === "folder") {
    input.setAttribute("webkitdirectory", "");
    input.removeAttribute("accept");
  } else {
    input.removeAttribute("webkitdirectory");
    input.setAttribute("accept", "*/*");
  }
  input.removeAttribute("capture");
  input.click();
}
function selectChatTool(tool) {
  const item = chatAttachmentTools.find((candidate) => candidate.tool === tool);
  if (!item) return;
  activeChatTool = item.tool;
  activeChatSkill = "";
  openChatMenu = "";
  renderChat();
}
function selectChatSkill(skillId, fromSlash = false) {
  const item = chatSkills.find((candidate) => candidate.id === skillId);
  if (!item) return;
  activeChatSkill = item.id;
  activeChatTool = "";
  openChatMenu = "";
  if (fromSlash) {
    const input = document.getElementById("chat-input");
    const text = chatDraft.trim();
    chatDraft = text === item.slash ? "" : text.replace(/^\/\w+\s*/, "");
    if (input) {
      input.value = chatDraft;
      localStorage.setItem("vibyra.desktop.chatDraft", chatDraft);
    }
  }
  renderChat();
}
function applySlashCommand(id) {
  const command = chatSlashCommands.find((candidate) => candidate.id === id);
  if (!command) return;
  chatDraft = command.slash;
  localStorage.setItem("vibyra.desktop.chatDraft", chatDraft);
  renderChat();
}
function toolSkillId(tool) {
  return "";
}
function selectedSkill() {
  return chatSkills.find((skill) => skill.id === activeChatSkill) || null;
}
function applySkillPrompt(skill, text) {
  if (!skill?.promptPrefix) return text;
  return text ? `${skill.promptPrefix}\n\nUser request: ${text}` : skill.promptPrefix;
}
