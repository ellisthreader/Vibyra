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
function modelMenu() {
  const autoModel = chatModels.find((model) => model.provider === "auto");
  const groups = chatModelGroups.filter((group) => modelGroupKey(group) !== "auto");
  const activeGroup = activeModelGroup();
  const activeKey = modelGroupKey(activeGroup);
  const modelButton = (model, extraClass = "") => {
    const locked = modelLocked(model);
    const selected = currentChatModel().key === model.key;
    return `<button class="${extraClass} ${selected ? "active" : ""} ${locked ? "locked" : ""}" type="button" data-model="${escapeAttribute(model.key)}">${providerLogo(model.provider)}<span><strong>${escapeHtml(model.label)}</strong><small>${escapeHtml(locked ? `${modelTier(model)} · upgrade` : model.provider === "auto" ? "Vibyra chooses" : providerGroupLabel({ options: [model] }))}</small></span>${locked ? `<em class="lock-tag">${icon("lock")}Upgrade</em>` : model.badge ? `<em>${escapeHtml(model.badge)}</em>` : ""}</button>`;
  };
  return `<div class="composer-menu model-menu model-picker">${autoModel ? `<div class="model-picker-current">${modelButton(autoModel, "model-auto-row")}</div>` : ""}<div class="model-provider-tabs" role="tablist" aria-label="Model providers">${groups.map((group) => `<button class="${activeKey === modelGroupKey(group) ? "active" : ""}" type="button" data-model-group="${escapeAttribute(modelGroupKey(group))}" aria-pressed="${activeKey === modelGroupKey(group) ? "true" : "false"}">${providerLogo(modelGroupKey(group))}<span>${escapeHtml(providerGroupLabel(group))}</span></button>`).join("")}</div><section class="model-picker-options" aria-label="${escapeAttribute(providerGroupLabel(activeGroup))} models">${activeGroup.options.map((model) => modelButton(model)).join("")}</section></div>`;
}
function effortMenu() { return `<div class="composer-menu effort-menu">${chatEfforts.map((effort) => `<button class="${reasoningEffort === effort.value ? "active" : ""}" type="button" data-effort="${escapeAttribute(effort.value)}"><span><strong>${escapeHtml(effort.label)}</strong><small>${escapeHtml(effort.hint)}</small></span></button>`).join("")}</div>`; }
function providerLogo(provider) {
  if (provider === "openai") return `<span class="provider-logo openai"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/OpenAI_logo_2025_%28symbol%29.svg/250px-OpenAI_logo_2025_%28symbol%29.svg.png" alt="" /></span>`;
  if (provider === "gemini") return `<span class="provider-logo gemini"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Google_Gemini_icon_2025.svg/250px-Google_Gemini_icon_2025.svg.png" alt="" /></span>`;
  if (provider === "claude") return `<span class="provider-logo claude"><svg viewBox="0 0 100 100" aria-hidden="true"><line x1="50" y1="50" x2="31" y2="10"/><line x1="50" y1="50" x2="57" y2="12"/><line x1="50" y1="50" x2="77" y2="21"/><line x1="50" y1="50" x2="90" y2="43"/><line x1="50" y1="50" x2="87" y2="60"/><line x1="50" y1="50" x2="73" y2="80"/><line x1="50" y1="50" x2="48" y2="91"/><line x1="50" y1="50" x2="31" y2="84"/><line x1="50" y1="50" x2="15" y2="70"/><line x1="50" y1="50" x2="8" y2="47"/><line x1="50" y1="50" x2="15" y2="28"/><circle cx="50" cy="50" r="14"/></svg></span>`;
  return `<span class="provider-logo auto">${icon("sparkles")}</span>`;
}
function openAttachmentPicker(kind) {
  const input = document.getElementById("chat-attach");
  if (!input) return;
  openChatMenu = "";
  if (kind === "clear") { chatAttachments = []; activeChatTool = ""; activeChatSkill = ""; renderChat(); return; }
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
