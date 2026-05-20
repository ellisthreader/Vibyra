async function sendChat() {
  if (chatSending) return;
  const input = document.getElementById("chat-input");
  const rawText = input.value.trim();
  chatNotice = null;
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
      profileContext: typeof desktopProfileContext === "function" ? desktopProfileContext() : null,
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
    if (isChatUsageLimitError(error)) {
      const pendingIndex = chatMessages.indexOf(pendingMessage);
      if (pendingIndex >= 0) chatMessages.splice(pendingIndex, 1);
      chatNotice = chatUsageLimitNotice(error);
    } else {
      pendingMessage.text = error instanceof Error ? error.message : "Vibyra AI chat failed. Try again.";
      pendingMessage.pending = false;
    }
  } finally {
    chatSending = false;
    saveActiveChat(rawText);
    render();
  }
}
function isChatUsageLimitError(error) {
  const message = String(error?.message || "").toLowerCase();
  return Number(error?.status) === 429 || message.includes("cap reached") || message.includes("usage limit") || message.includes("rate limit");
}
function chatUsageLimitNotice(error) {
  const message = String(error?.message || "").trim();
  const lower = message.toLowerCase();
  const title = lower.includes("5-hour") || lower.includes("burst") ? "5-hour limit reached" : "AI limit reached";
  return {
    title,
    message: humanChatLimitMessage(message),
    resetAt: error?.resetAt || error?.burstCreditsResetAt || error?.weeklyCreditsResetAt || ""
  };
}
function humanChatLimitMessage(message) {
  const lower = message.toLowerCase();
  if (lower.includes("5-hour") || lower.includes("burst")) {
    return "Take a short break. Your burst window resets every 5 hours.";
  }
  if (lower.includes("daily")) {
    return "Your daily AI usage cap has been reached. It resets every 24 hours.";
  }
  if (lower.includes("weekly")) {
    return "Your weekly AI usage cap has been reached. It resets every 7 days.";
  }
  return message || "You have reached your AI usage limit. Try again later.";
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
