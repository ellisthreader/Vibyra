function openPairModal() { nodes.pairModal.classList.add("open"); renderPairModal(); }
function closePairModal() { nodes.pairModal.classList.remove("open"); }
function renderPairModal() {
  const pending = currentState.pendingPair && currentState.pendingPair.status === "pending";
  const paired = Boolean(currentState.pairedDevice);
  nodes.pairBody.innerHTML = `<section class="pair-simple"><div class="pair-code-card"><p class="kicker">Pair code</p><div class="pair-code">${escapeHtml(currentState.pairCode || "------")}</div><p class="body-copy">Open Vibyra on your phone and enter this code.</p></div>${pending ? `<div class="nearby-phone-card pending"><span class="nearby-phone-icon">${icon("phone")}</span><div><p class="kicker">Nearby phone</p><h2>${escapeHtml(currentState.pendingPair.deviceName || "Vibyra Phone")}</h2><p class="body-copy">Approve only if this is your phone.</p></div><div class="approval-actions"><button class="danger-button" id="deny-pair" type="button" ${posting ? "disabled" : ""}>Deny</button><button class="primary-button" id="approve-pair" type="button" ${posting ? "disabled" : ""}>Allow</button></div></div>` : `<div class="nearby-phone-card"><span class="nearby-phone-icon">${icon(paired ? "phone" : "search")}</span><span><p class="kicker">${paired ? "Connected phone" : "Nearby phones"}</p><h2>${escapeHtml(paired ? currentState.pairedDevice : "Waiting for phone")}</h2><p class="body-copy">${paired ? "Your phone can use this desktop bridge." : "Pairing requests will appear here automatically."}</p></span></div>`}</section>`;
  document.getElementById("approve-pair")?.addEventListener("click", () => post("/desktop/approve"));
  document.getElementById("deny-pair")?.addEventListener("click", () => post("/desktop/deny"));
}
function openTokenModal() {
  nodes.tokenModal.classList.add("open");
  renderTokenModal();
  if (typeof refreshDesktopAccountSession === "function") {
    refreshDesktopAccountSession()
      .then(() => { if (nodes.tokenModal.classList.contains("open")) renderTokenModal(); })
      .catch(() => {});
  }
}
function closeTokenModal() { nodes.tokenModal.classList.remove("open"); }
function renderTokenModal() {
  const account = currentAccount();
  const tier = currentPlanTier();
  const cycle = account.planBillingCycle === "annual" ? "annual" : "monthly";
  const allowance = Number(account.monthlyCredits || (cycle === "annual" ? tier.annualCredits : tier.monthlyCredits));
  const balance = Number(account.creditsBalance ?? allowance);
  const used = Number(account.creditsUsed ?? 0);
  const dailyCap = Number(account.dailyCreditsCap || tier.dailyCap || 0);
  const dailyUsed = Number(account.dailyCreditsUsed || 0);
  const planLabel = `${tier.name}${cycle === "annual" && tier.key !== "free" ? " annual" : ""}`;
  const manageLabel = tier.key === "free" ? "Upgrade plan" : "Manage billing";
  nodes.tokenBody.innerHTML = `<section class="membership-hero"><div><p class="kicker">Membership</p><h1>${escapeHtml(account.name || "Desktop account")}</h1><p class="body-copy">${escapeHtml(account.email || "Signed in on this desktop")}</p><span class="membership-pill">${icon("sparkles")}${escapeHtml(planLabel)}</span></div><div class="membership-balance"><strong>${formatCredits(balance)}</strong><span>credits left</span></div></section><section class="membership-metrics"><div><strong>${formatCredits(allowance)}</strong><span>monthly credits</span></div><div><strong>${formatCredits(used)}</strong><span>credits used</span></div><div><strong>${dailyCap ? `${formatCredits(dailyUsed)} / ${formatCredits(dailyCap)}` : "None"}</strong><span>daily cap</span></div><div><strong>${escapeHtml(tier.modelAccess)}</strong><span>models</span></div></section><section class="membership-plans">${planTiers.map((plan) => planCard(plan, tier.key, cycle)).join("")}</section><section class="settings-group account-actions"><p class="group-title">Account</p><button class="setting-row" data-billing-manage type="button"><span class="setting-label">${escapeHtml(manageLabel)}</span><span class="setting-value">${tier.key === "free" ? "Open checkout" : "Stripe portal"}</span>${icon("arrow")}</button><button class="setting-row danger-setting" data-setting="Log out" type="button"><span class="setting-label">Log out</span><span class="setting-value">Change account</span>${icon("logout")}</button></section>`;
  document.querySelectorAll("[data-billing-plan]").forEach((button) => button.addEventListener("click", () => startDesktopBilling(button.dataset.billingPlan)));
  document.querySelector("[data-billing-manage]")?.addEventListener("click", () => tier.key === "free" ? startDesktopBilling("starter") : manageDesktopBilling());
}
function planCard(plan, currentKey, cycle) {
  const active = plan.key === currentKey;
  const credits = cycle === "annual" && plan.key !== "free" ? plan.annualCredits : plan.monthlyCredits;
  const price = cycle === "annual" && plan.annualPrice ? plan.annualPrice : plan.price;
  const annual = plan.key !== "free" && plan.annualCredits !== plan.monthlyCredits ? `<small>Annual: ${formatCredits(plan.annualCredits)} credits / month</small>` : "";
  return `<article class="membership-plan ${active ? "active" : ""}"><div class="membership-plan-head"><span><strong>${escapeHtml(plan.name)}</strong><small>${escapeHtml(price)}</small></span>${plan.badge ? `<em>${escapeHtml(plan.badge)}</em>` : active ? `<em>Current</em>` : ""}</div><p>${formatCredits(credits)} credits / month${annual}</p><ul>${plan.perks.map((perk) => `<li>${escapeHtml(perk)}</li>`).join("")}</ul>${active || plan.key === "free" ? "" : `<button class="secondary-button compact-button" data-billing-plan="${escapeAttribute(plan.key)}" type="button">Upgrade</button>`}</article>`;
}
function startDesktopBilling(plan) {
  if (typeof startDesktopBillingCheckout === "function") startDesktopBillingCheckout(plan);
}
function manageDesktopBilling() {
  if (typeof openDesktopBillingPortal === "function") openDesktopBillingPortal();
}
function loadDesktopChats() {
  try {
    const value = JSON.parse(localStorage.getItem(desktopChatsKey) || "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter((chat) => chat && typeof chat.id === "string" && Array.isArray(chat.messages))
      .map((chat) => ({
        id: chat.id,
        title: String(chat.title || "New chat").slice(0, 80),
        pinned: Boolean(chat.pinned),
        archived: Boolean(chat.archived),
        updatedAt: Number(chat.updatedAt) || 0,
        messages: chat.messages
          .filter((message) => message && (message.role === "user" || message.role === "assistant"))
          .map((message) => ({ role: message.role, text: String(message.text || ""), image: normalizeChatImage(message.image), app: normalizeChatApp(message.app, true) }))
          .slice(-40)
      }))
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt)
      .slice(0, 12);
  } catch {
    return [];
  }
}
function saveDesktopChats() {
  recentChats = recentChats
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt)
    .slice(0, 12);
  localStorage.setItem(desktopChatsKey, JSON.stringify(recentChats));
}
function messagesForChat(id) {
  return recentChats.find((chat) => chat.id === id)?.messages?.map((message) => ({ ...message })) || [];
}
function activeChat() {
  return recentChats.find((chat) => chat.id === activeChatId) || null;
}
function ensureActiveChat(seedText = "") {
  if (activeChatId && recentChats.some((chat) => chat.id === activeChatId)) return;
  activeChatId = `chat-${Date.now()}`;
  localStorage.setItem(activeChatKey, activeChatId);
  recentChats.unshift({ id: activeChatId, title: chatTitleFromText(seedText), pinned: false, archived: false, updatedAt: Date.now(), messages: [] });
}
function saveActiveChat(seedText = "") {
  if (!chatMessages.length) return;
  ensureActiveChat(seedText);
  const chat = recentChats.find((item) => item.id === activeChatId);
  if (!chat) return;
  chat.messages = chatMessages.map((message) => ({ role: message.role, text: message.text, image: normalizeChatImage(message.image), app: normalizeChatApp(message.app, true) })).slice(-40);
  if (!chat.title || chat.title === "New chat") chat.title = chatTitleFromText(seedText || chat.messages.find((message) => message.role === "user")?.text || "");
  chat.updatedAt = Date.now();
  saveDesktopChats();
}
function chatTitleFromText(text) {
  const title = String(text || "").replace(/\s+/g, " ").trim();
  if (!title) return "New chat";
  return title.length > 36 ? `${title.slice(0, 35)}...` : title;
}
function normalizeChatImage(image) {
  if (!image || typeof image !== "object") return null;
  const url = String(image.url || "").trim();
  if (!url) return null;
  return {
    provider: String(image.provider || "").slice(0, 80),
    title: String(image.title || "Generated image").slice(0, 80),
    url
  };
}
function normalizeChatApp(app, persist = false) {
  if (!app || typeof app !== "object") return null;
  const url = String(app.url || app.previewUrl || "").trim();
  const rawHtml = String(app.html || "").trim();
  const html = persist ? (rawHtml.length <= 120000 ? rawHtml : "") : rawHtml;
  if (!url && !html) return null;
  return {
    title: String(app.title || "Generated app").slice(0, 80),
    url,
    html
  };
}
function openRecentChat(id) {
  const chat = recentChats.find((item) => item.id === id);
  if (!chat) return;
  activeChatId = chat.id;
  chatMessages = messagesForChat(chat.id);
  localStorage.setItem(activeChatKey, activeChatId);
  setPage("chat");
}
function startNewChat() {
  activeChatId = "";
  chatMessages = [];
  chatAttachments = [];
  chatDraft = "";
  activeChatTool = "";
  activeChatSkill = "";
  openChatMenu = "";
  topbarChatMenuOpen = false;
  localStorage.removeItem(activeChatKey);
  localStorage.removeItem("vibyra.desktop.chatDraft");
  setPage("chat");
}
function isBlankNewChat() {
  return !activeChatId && !chatMessages.length && !chatDraft.trim() && !chatAttachments.length && !activeChatTool && !activeChatSkill;
}
function accountImageUrl(user, account) {
  return user?.profileImageUri || user?.profileImageUrl || user?.avatarUrl || user?.avatar || account?.profileImageUri || account?.profileImageUrl || account?.avatarUrl || "";
}
function accountInitials(name) {
  const parts = String(name || "Vibyra User").trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : (parts[0] || "V")[0]).toUpperCase();
}
function accountLevelLabel(user, account) {
  const raw = user?.level?.level ?? user?.levelProgress?.level ?? user?.level ?? account?.level?.level ?? account?.levelProgress?.level ?? account?.level;
  const numeric = Number.parseInt(String(raw ?? ""), 10);
  if (Number.isSafeInteger(numeric) && numeric > 0) return `Level ${numeric}`;
  return "Level 1";
}
function currentAccount() {
  const user = typeof desktopAuthUser === "function" ? desktopAuthUser() : null;
  const account = currentState.desktopAccount || user || {};
  return { ...(user || {}), ...(account || {}) };
}
function normalizePlanKey(plan) {
  const key = String(plan || "free").trim().toLowerCase();
  return planTiers.some((tier) => tier.key === key) ? key : "free";
}
function currentPlanTier() {
  const key = normalizePlanKey(currentAccount().plan);
  return planTiers.find((tier) => tier.key === key) || planTiers[0];
}
function currentAllowedModelTiers() {
  const account = currentAccount();
  if (Array.isArray(account.allowedModelTiers) && account.allowedModelTiers.length) return account.allowedModelTiers.map(String);
  return planAllowedTiers[normalizePlanKey(account.plan)] || planAllowedTiers.free;
}
function modelTier(model) {
  return modelTiers[model?.key] || "balanced";
}
function modelLocked(model) {
  return !currentAllowedModelTiers().includes(modelTier(model));
}
function firstUnlockedModel() {
  return chatModels.find((model) => !modelLocked(model))?.key || "auto";
}
function formatCredits(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)).toLocaleString() : "0";
}
function renderSendState() {
  const input = document.getElementById("chat-input");
  const button = document.getElementById("send-chat");
  if (!input || !button) return;
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
  button.disabled = chatSending || !input.value.trim();
}
function toggleChatMenu(menu) { openChatMenu = openChatMenu === menu ? "" : menu; renderChat(); }
function currentChatModel() {
  const selected = chatModels.find((model) => model.key === selectedChatModel) || chatModels[0];
  return modelLocked(selected) ? (chatModels.find((model) => model.key === firstUnlockedModel()) || chatModels[0]) : selected;
}
function currentEffort() { return chatEfforts.find((effort) => effort.value === reasoningEffort) || chatEfforts[1]; }
function selectChatModel(modelKey) {
  const model = chatModels.find((item) => item.key === modelKey);
  if (!model) return;
  if (modelLocked(model)) {
    openChatMenu = "";
    openTokenModal();
    return;
  }
  selectedChatModel = model.key;
  localStorage.setItem("vibyra.desktop.chatModel", selectedChatModel);
  openChatMenu = "";
  renderChat();
}
function activeChatTitle() {
  return activeChat()?.title || "New chat";
}
function chatDirectoryLabel(selected = currentProject()) {
  return selected?.path || selected?.name || "No directory selected";
}
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
function modelMenu() { return `<div class="composer-menu model-menu">${chatModelGroups.map((group) => `<section>${group.title ? `<p>${escapeHtml(group.title)}</p>` : ""}${group.options.map((model) => { const locked = modelLocked(model); const selected = currentChatModel().key === model.key; return `<button class="${selected ? "active" : ""} ${locked ? "locked" : ""}" type="button" data-model="${escapeAttribute(model.key)}">${providerLogo(model.provider)}<span><strong>${escapeHtml(model.label)}</strong><small>${escapeHtml(locked ? `${modelTier(model)} · upgrade` : model.provider === "auto" ? "Vibyra chooses" : model.provider)}</small></span>${locked ? `<em class="lock-tag">${icon("lock")}Upgrade</em>` : model.badge ? `<em>${escapeHtml(model.badge)}</em>` : ""}</button>`; }).join("")}</section>`).join("")}</div>`; }
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
async function sendChat() {
  if (chatSending) return;
  const input = document.getElementById("chat-input");
  const rawText = input.value.trim();
  const slashSkill = rawText.match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
  if (slashSkill) {
    const skill = chatSkills.find((item) => item.id === slashSkill[1].toLowerCase());
    if (skill) {
      activeChatSkill = skill.id;
      activeChatTool = "";
    }
  }
  const skill = selectedSkill();
  const skillText = skill && slashSkill?.[1].toLowerCase() === skill.id ? (slashSkill[2] || "").trim() : rawText;
  const text = skill ? skillText : rawText;
  if (!text && !skill) return;
  if (!skill && (text === "/clear" || text === "/new")) { startNewChat(); return; }
  if (!skill && text === "/help") {
    chatMessages.push({ role: "user", text }, { role: "assistant", text: chatHelpText() });
    chatDraft = "";
    localStorage.removeItem("vibyra.desktop.chatDraft");
    input.value = "";
    saveActiveChat(text);
    render();
    return;
  }
  if (!skill && text === "/open") {
    chatMessages.push({ role: "user", text }, { role: "assistant", text: "Open Projects to choose a desktop project, then come back here and ask Vibyra about it." });
    chatDraft = "";
    localStorage.removeItem("vibyra.desktop.chatDraft");
    input.value = "";
    saveActiveChat(text);
    render();
    return;
  }
  const project = currentProject();
  if (modelLocked(chatModels.find((model) => model.key === selectedChatModel))) {
    selectedChatModel = firstUnlockedModel();
    localStorage.setItem("vibyra.desktop.chatModel", selectedChatModel);
  }
  const attachments = [...chatAttachments];
  const tool = activeChatTool;
  const skillId = skill?.skill || skill?.id || toolSkillId(tool);
  const mode = "chat";
  const skillPromptText = skill ? (text || (skill.promptPrefix ? "" : skill.label)) : text;
  const prompt = skill ? applySkillPrompt(skill, skillPromptText) : text;
  const history = chatMessages
    .filter((message) => (message.role === "user" || message.role === "assistant") && !message.pending && String(message.text || "").trim())
    .slice(-6)
    .map((message) => ({ role: message.role, text: message.text }));
  const pendingMessage = { role: "assistant", text: "Thinking...", pending: true };
  chatMessages.push({ role: "user", text: displayChatText(rawText, skill, tool) }, pendingMessage);
  chatAttachments = [];
  activeChatTool = "";
  activeChatSkill = "";
  chatDraft = "";
  localStorage.removeItem("vibyra.desktop.chatDraft");
  input.value = "";
  chatSending = true;
  render();
  try {
    const result = await requestDesktopChat({
      attachments,
      history,
      model: selectedChatModel,
      mode,
      projectId: project?.id || "",
      prompt,
      reasoningEffort,
      skill: skillId,
      tool
    });
    pendingMessage.text = result.reply || "I received an empty response from Vibyra AI.";
    pendingMessage.image = normalizeChatImage(result.image);
    pendingMessage.app = normalizeChatApp(result.app);
    pendingMessage.pending = false;
    updateActiveChatTitle(result.title, rawText);
  } catch (error) {
    pendingMessage.text = error instanceof Error ? error.message : "Vibyra AI chat failed. Try again.";
    pendingMessage.pending = false;
  } finally {
    chatSending = false;
    saveActiveChat(rawText);
    render();
  }
}
function chatHelpText() {
  return [
    "Commands: /help, /clear, /new, /open.",
    "Skills: /plan, /debug, /review, /explain, /fix, /refactor.",
    "Use the paperclip menu to attach local files or folder context."
  ].join("\n");
}
function displayChatText(rawText, skill, tool) {
  if (skill && rawText.match(/^\/\w+/)) return rawText;
  if (skill) return `${skill.slash} ${rawText}`.trim();
  const toolItem = chatAttachmentTools.find((item) => item.tool === tool);
  return toolItem ? `${toolItem.label}: ${rawText}` : rawText;
}
function updateActiveChatTitle(title, seedText) {
  if (!title) return;
  ensureActiveChat(seedText);
  const chat = activeChat();
  if (chat && (!chat.title || chat.title === "New chat" || chat.title === chatTitleFromText(seedText))) {
    chat.title = String(title).slice(0, 80);
  }
}
function setPage(page) { activePage = page; topbarChatMenuOpen = false; localStorage.setItem("vibyra.desktop.page", page); render(); }
function bindJumps() { document.querySelectorAll("[data-jump]").forEach((button) => button.addEventListener("click", () => setPage(button.dataset.jump))); }
function pageTitle(page) { return page === "dashboard" ? "Builds" : page === "projects" ? "Projects" : "New chat"; }
function statusTone() {
  if (currentState.pendingPair && currentState.pendingPair.status === "pending") return "warning";
  if (currentState.pendingPair && currentState.pendingPair.status === "denied") return "offline";
  if (currentState.pairedDevice) return "success";
  return "offline";
}
function statusLabel() {
  if (currentState.pendingPair && currentState.pendingPair.status === "pending") return currentState.pairedDevice ? "Connected to phone" : "Not connected";
  if (currentState.pendingPair && currentState.pendingPair.status === "denied") return "Request denied";
  if (currentState.pairedDevice) return "Connected to phone";
  return "Not connected";
}
function statusShortLabel() { return currentState.pendingPair && currentState.pendingPair.status === "pending" ? "Pending" : currentState.pairedDevice ? "Connected" : "Waiting"; }
function filteredProjects() {
  const query = projectQuery.trim().toLowerCase();
  return (currentState.projects || []).filter((project) => {
    const source = String(project.source || "desktop").toLowerCase();
    const filterOk = projectFilter === "All" || (projectFilter === "Desktop" ? source !== "mobile" : source === "mobile");
    const queryOk = !query || [project.name, project.path, project.stack].join(" ").toLowerCase().includes(query);
    return filterOk && queryOk;
  });
}
function summaryTile(iconName, value, label) {
  return `<div class="summary-tile"><span class="summary-icon">${icon(iconName)}</span><div><strong>${escapeHtml(value)}</strong><p>${escapeHtml(label)}</p></div></div>`;
}
function buildRows(rows = liveBuildRows()) {
  return rows.map((item) => `<article class="build-row ${item.isRunning ? "is-running" : ""}"><span class="build-icon ${escapeAttribute(item.tone)}">${icon(item.icon)}</span><div class="build-copy"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.subtitle)}</p></div><div class="build-state"><span class="build-status ${escapeAttribute(item.tone)}"><span class="status-light"></span>${escapeHtml(item.status)}</span><time class="build-time">${escapeHtml(buildTimeLabel(item))}</time></div><button class="more-button" type="button" aria-label="Build actions">${icon("menu")}</button></article>`).join("");
}
function liveBuildRows() {
  const run = currentState.activeAgentRun || {};
  const runProject = (currentState.projects || []).find((project) => project.id === run.projectId);
  return run.id ? [{
    icon: run.state === "waiting" ? "clock" : "pulse", tone: run.state === "waiting" ? "purple" : "green", status: run.state === "waiting" ? "Waiting" : "Building",
    title: runProject?.name || currentState.latestPreview?.title || "Active build",
    subtitle: run.title || run.file || "Local desktop task",
    startedAt: runStartedAt(run), timeVerb: run.state === "waiting" ? "Waiting" : "Running",
    isRunning: run.state !== "waiting"
  }] : [];
}
function runStartedAt(run) {
  const idTime = Number(String(run.id || "").replace(/\D/g, ""));
  return idTime > 1_000_000_000_000 ? idTime : Date.parse(run.updatedAt || "") || Date.now();
}
function buildTimeLabel(item) {
  return `${item.timeVerb} ${formatDuration(Date.now() - item.startedAt)}`;
}
function formatDuration(ms) {
  const minutes = Math.max(1, Math.floor(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
function emptyBuildState() {
  return `<div class="empty-build"><span class="empty-icon">${icon("pulse")}</span><h2>No active builds</h2><p class="body-copy">Phone-started build work appears here when it is running on this desktop.</p><button class="primary-button" type="button" data-jump="chat">${icon("plus")}New chat</button></div>`;
}
function projectCard(project, index) { const active = selectedProjectId ? selectedProjectId === project.id : index === 0; return `<article class="project-card ${active ? "active" : ""}"><div class="project-top"><div style="display:flex;gap:12px;min-width:0;"><span class="project-icon">${icon("folder")}</span><div><p class="project-name">${escapeHtml(project.name || "Project")}</p><p class="project-path">${escapeHtml(project.path || "")}</p></div></div><span class="tag">${escapeHtml(displayProjectSource(project))}</span></div><div class="project-footer"><span class="body-copy">${escapeHtml(project.stack || "Project")}</span><button class="secondary-button compact-button" type="button" data-project-chat="${escapeAttribute(project.id)}">${icon("chat")}Chat</button></div></article>`; }
function chatEmptyState() { const project = currentProject(); const title = typeof vibyraChatEmptyTitle === "function" ? vibyraChatEmptyTitle() : "How can I help today?"; return `<div class="chat-empty">${project ? `<p class="kicker">${escapeHtml(project.name)}</p>` : ""}<h1>${escapeHtml(title)}</h1><div class="suggestions">${suggestions.map((item) => `<button class="suggestion" type="button" data-suggestion="${escapeAttribute(item.prompt)}"><span class="action-icon">${icon(item.icon)}</span><span>${escapeHtml(item.title)}</span></button>`).join("")}</div></div>`; }
function messageRow(message, index) {
  const assistant = message.role === "assistant";
  const image = normalizeChatImage(message.image);
  const app = normalizeChatApp(message.app);
  const avatar = assistant ? `<span class="message-avatar" aria-hidden="true"><img src="/app-assets/vibyra.png" alt="" /></span>` : "";
  return `<div class="message ${assistant ? "assistant" : "user"}">${avatar}<div class="message-card"><div class="message-author">${assistant ? "Vibyra" : "You"}</div><div class="message-body">${escapeHtml(message.text)}</div>${image ? `<figure class="generated-image-card"><img src="${escapeAttribute(image.url)}" alt="${escapeAttribute(image.title)}" /><figcaption><strong>${escapeHtml(image.title)}</strong>${image.provider ? `<span>${escapeHtml(image.provider)}</span>` : ""}</figcaption></figure>` : ""}${app ? `<figure class="generated-app-card"><figcaption><span>${icon("code")}</span><strong>${escapeHtml(app.title)}</strong><button type="button" data-open-app="${index}">${icon("play")}Open</button></figcaption></figure>` : ""}</div></div>`;
}
function projectContextChip() { const project = currentProject(); return project ? `<span class="context-chip project-chip">${icon("folder")}<span>${escapeHtml(project.name || "Project")}</span><button id="clear-project" type="button" aria-label="Remove project">${icon("close")}</button></span>` : ""; }
function attachmentChips() { return chatAttachments.length ? `<span class="context-chip">${icon("paperclip")}<span>${chatAttachments.length} file${chatAttachments.length === 1 ? "" : "s"}</span><button id="clear-attachments" type="button" aria-label="Clear attachments">${icon("close")}</button></span>` : ""; }
function toolChip() {
  const tool = chatAttachmentTools.find((item) => item.tool === activeChatTool);
  return tool ? `<span class="context-chip tool-chip">${icon(tool.icon)}<span>${escapeHtml(tool.label)}</span><button id="clear-tool" type="button" aria-label="Clear tool">${icon("close")}</button></span>` : "";
}
function skillChip() {
  const skill = selectedSkill();
  return skill ? `<span class="context-chip skill-chip">${icon(skill.icon || "sparkles")}<span>${escapeHtml(skill.label)}</span><button id="clear-skill" type="button" aria-label="Clear skill">${icon("close")}</button></span>` : "";
}
function slashMenu() {
  const match = chatDraft.match(/^\/(\w*)$/);
  if (!match) return "";
  const query = match[1].toLowerCase();
  const commands = chatSlashCommands.filter((item) => !query || item.id.includes(query) || item.label.toLowerCase().includes(query) || item.slash.includes(`/${query}`));
  const skills = chatSkills.filter((item) => !query || item.id.includes(query) || item.label.toLowerCase().includes(query) || item.slash.includes(`/${query}`));
  if (!commands.length && !skills.length) return "";
  return `<div class="slash-menu"><section>${commands.map((command) => `<button type="button" data-slash-command="${escapeAttribute(command.id)}">${icon(command.icon)}<span><strong>${escapeHtml(command.slash)} <b>${escapeHtml(command.label)}</b></strong><small>${escapeHtml(command.description)}</small></span></button>`).join("")}</section><section>${skills.map((skill) => `<button type="button" data-slash-skill="${escapeAttribute(skill.id)}">${icon(skill.icon || "sparkles")}<span><strong>${escapeHtml(skill.slash)} <b>${escapeHtml(skill.label)}</b></strong><small>${escapeHtml(skill.description)}</small></span></button>`).join("")}</section></div>`;
}
function activeRunCard() {
  const item = liveBuildRows()[0];
  if (!item) return "";
  return `<article class="run-card ${item.isRunning ? "is-running" : ""}"><span class="run-icon">${icon(item.icon)}</span><div><p class="run-label">${escapeHtml(item.status)}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.subtitle)}</p></div><time>${escapeHtml(buildTimeLabel(item))}</time></article>`;
}
function eventRows(events) { if (!events.length) return `<div class="empty">Nothing yet.</div>`; return events.map((event) => `<div class="event-row"><span class="event-dot" style="background:${toneColor(event.tone)}"></span><div><p class="event-message">${escapeHtml(event.message || "Desktop event")}</p><p class="event-source">${escapeHtml(event.source || "Desktop")}</p></div></div>`).join(""); }
function toneColor(tone) { return tone === "success" ? "#37D67A" : tone === "warning" ? "#FFB347" : tone === "error" ? "#FF5D7A" : "#6D3BFF"; }
function icon(name) {
  const paths = {
    grid: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
    home: '<path d="m4 11 8-7 8 7v9H6v-7h4v7h8v-9"/>',
    folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/>',
    chat: '<path d="M5 5h14v10H8l-4 4V6a1 1 0 0 1 1-1z"/>',
    people: '<path d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM15.5 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 20a5.5 5.5 0 0 1 11 0zM13 20a4.5 4.5 0 0 1 8 0z"/>',
    phone: '<path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM10 18h4"/>',
    user: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"/>',
    copy: '<path d="M8 8h11v11H8zM5 16H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    menu: '<path d="M12 5h.01M12 12h.01M12 19h.01"/>',
    pulse: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    clock: '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v6l4 2"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 10-13h-7z"/>',
    desktop: '<path d="M3 5h18v12H3zM9 21h6M12 17v4"/>',
    "image-stack": '<path d="M5 6h14v12H5zM8 10h.01M5 16l4-4 3 3 2-2 5 5M3 10V4h13"/>',
    image: '<path d="M4 5h16v14H4zM8 10h.01M4 17l5-5 4 4 2-2 5 5"/>',
    globe: '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.6 9h16.8M3.6 15h16.8M12 3c2 2.4 3 5.4 3 9s-1 6.6-3 9M12 3c-2 2.4-3 5.4-3 9s1 6.6 3 9"/>',
    document: '<path d="M6 3h8l4 4v14H6zM14 3v5h5M9 13h6M9 17h6"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    help: '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.8 9a2.4 2.4 0 0 1 4.6 1c0 1.8-2.4 2-2.4 3.6M12 17h.01"/>',
    search: '<path d="M10.5 18a7.5 7.5 0 1 1 5.3-12.8A7.5 7.5 0 0 1 10.5 18zM16 16l5 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    sparkles: '<path d="M12 2l1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7zM5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8z"/>',
    card: '<path d="M3 6h18v12H3zM3 10h18"/>',
    lock: '<path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6z"/>',
    tool: '<path d="M14 6a4 4 0 0 0 4 4l-8 8-4-4 8-8zM6 14l4 4"/>',
    cube: '<path d="M12 2 4 6v12l8 4 8-4V6zM4 6l8 4 8-4M12 10v12"/>',
    code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
    rocket: '<path d="M12 15 9 12c1-5 4-8 10-9-1 6-4 9-9 10zM9 12l-4 1-2 5 5-2 1-4zM15 6h.01"/>',
    paperclip: '<path d="M7 12.5 13.5 6a4 4 0 0 1 5.7 5.7l-8 8A5 5 0 0 1 4.1 12.6l8-8"/>',
    send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    pin: '<path d="M12 17v5M7 17h10M9 3h6l1 7 3 3v4H5v-4l3-3z"/>',
    archive: '<path d="M4 7h16M6 7v12h12V7M9 11h6M5 3h14l1 4H4z"/>',
    edit: '<path d="M4 20h4l11-11-4-4L4 16zM13 7l4 4"/>',
    share: '<path d="M12 5v10M8 9l4-4 4 4M5 13v6h14v-6"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
    diamond: '<path d="M12 3 21 9l-9 12L3 9z"/>',
    calendar: '<path d="M5 4h14v16H5zM8 2v4M16 2v4M5 9h14"/>',
    palette: '<path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 1.5-3.3 1.5 1.5 0 0 1 1.1-2.7H18a6 6 0 0 0 0-12zM7.5 10h.01M10 7h.01M14 7h.01M16.5 10h.01"/>',
    logout: '<path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.sparkles}</svg>`;
}
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
function displayProjectSource(project) { return String(project.source || "desktop").toLowerCase() === "mobile" ? "Phone" : "Desktop"; }
function currentProject() { return (currentState.projects || []).find((project) => project.id === selectedProjectId) || null; }
function bindProjectActions() {
  document.querySelectorAll("[data-project-chat]").forEach((button) => button.addEventListener("click", () => {
    const project = (currentState.projects || []).find((item) => item.id === button.dataset.projectChat);
    if (!project) return;
    selectedProjectId = project.id;
    localStorage.setItem("vibyra.desktop.project", selectedProjectId);
    chatMessages.push({ role: "assistant", text: `Project selected: ${project.name}. Ask me what to change or type /open for folder guidance.` });
    setPage("chat");
  }));
}
function bindChatTools() {
  document.getElementById("chat-attach")?.addEventListener("change", (event) => {
    chatAttachments = Array.from(event.target.files || []).map((file) => file.webkitRelativePath || file.name).slice(0, 6);
    openChatMenu = "";
    renderChat();
  });
}
function bindGeneratedAppCards() {
  document.querySelectorAll("[data-open-app]").forEach((button) => button.addEventListener("click", () => openGeneratedApp(button.dataset.openApp)));
}
function openGeneratedApp(index) {
  const app = normalizeChatApp(chatMessages[Number(index)]?.app);
  if (!app) return;
  if (app.url) {
    window.open(app.url, "_blank", "noopener");
    return;
  }
  if (app.html) {
    const url = URL.createObjectURL(new Blob([app.html], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
