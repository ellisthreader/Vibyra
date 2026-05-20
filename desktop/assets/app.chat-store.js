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
function modelGroupKey(group) {
  return group?.options?.find((model) => model.provider !== "auto")?.provider || "auto";
}
function providerGroupLabel(group) {
  const key = modelGroupKey(group);
  if (key === "openai") return "OpenAI";
  if (key === "claude") return "Claude";
  if (key === "gemini") return "Gemini";
  return group?.title || "Auto";
}
function modelGroupForModel(model) {
  const group = chatModelGroups.find((item) => item.options.some((option) => option.key === model?.key));
  return modelGroupKey(group);
}
function activeModelGroup() {
  const groups = chatModelGroups.filter((group) => modelGroupKey(group) !== "auto");
  const selected = modelMenuGroup || modelGroupForModel(currentChatModel());
  if (selected === "auto") return groups.find((group) => modelGroupKey(group) === "openai") || groups[0] || chatModelGroups[0];
  return groups.find((group) => modelGroupKey(group) === selected) || groups[0] || chatModelGroups[0];
}
function selectModelMenuGroup(groupKey) {
  modelMenuGroup = groupKey || "";
  openChatMenu = "model";
  renderChat();
}
function selectChatModel(modelKey) {
  const model = chatModels.find((item) => item.key === modelKey);
  if (!model) return;
  if (modelLocked(model)) {
    openChatMenu = "";
    openTokenModal("plans");
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
