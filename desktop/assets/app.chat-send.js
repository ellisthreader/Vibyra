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
  const project = currentProject();
  const requestModel = "local";
  const requestEffort = "medium";
  ensureActiveChat(rawText);
  const transcriptOptions = {
    model: requestModel,
    projectId: project?.id || String(selectedProjectId || ""),
    projectName: project?.name || "",
    sessionId: `desktop-chat:${activeChatId}`
  };
  let transcriptTurn = null;
  try {
    transcriptTurn = await persistDesktopPromptTranscript(rawText, "desktop-chat", transcriptOptions);
  } catch (error) {
    chatNotice = {
      title: "Prompt not sent",
      message: error instanceof Error ? error.message : "Prompt transcript could not be saved.",
      resetAt: ""
    };
    render();
    return;
  }
  if (!skill && (text === "/clear" || text === "/new")) {
    await persistDesktopPromptOutcome(transcriptTurn, {
      result: "Started a new desktop chat.",
      status: "completed"
    }, "desktop-chat", transcriptOptions);
    startNewChat();
    return;
  }
  if (!skill && text === "/help") {
    const localResult = chatHelpText();
    chatMessages.push({ role: "user", text }, { role: "assistant", text: localResult });
    chatDraft = "";
    localStorage.removeItem("vibyra.desktop.chatDraft");
    input.value = "";
    saveActiveChat(text);
    render();
    await persistDesktopPromptOutcome(transcriptTurn, {
      result: localResult,
      status: "completed"
    }, "desktop-chat", transcriptOptions);
    return;
  }
  if (!skill && text === "/open") {
    const localResult = "Open Projects to choose a desktop project, then come back here and ask Vibyra about it.";
    chatMessages.push({ role: "user", text }, { role: "assistant", text: localResult });
    chatDraft = "";
    localStorage.removeItem("vibyra.desktop.chatDraft");
    input.value = "";
    saveActiveChat(text);
    render();
    await persistDesktopPromptOutcome(transcriptTurn, {
      result: localResult,
      status: "completed"
    }, "desktop-chat", transcriptOptions);
    return;
  }
  const attachments = [...chatAttachments];
  const imageAttachments = [...chatImageAttachments];
  const tool = activeChatTool;
  const skillId = skill?.skill || skill?.id || toolSkillId(tool);
  const mode = "chat";
  const skillPromptText = skill ? (text || (skill.promptPrefix ? "" : skill.label)) : text;
  const prompt = skill ? applySkillPrompt(skill, skillPromptText) : text;
  const actionContextScope = desktopActionContextScope("chat", activeChatId);
  const history = chatMessages
    .filter((message) => (message.role === "user" || message.role === "assistant") && !message.pending && String(message.text || "").trim())
    .slice(-6)
    .map((message) => ({ role: message.role, text: message.text }));
  const pendingMessage = { role: "assistant", text: "Thinking...", pending: true };
  chatMessages.push({ role: "user", text: displayChatText(rawText, skill, tool) }, pendingMessage);
  chatAttachments = [];
  chatImageAttachments = [];
  activeChatTool = "";
  activeChatSkill = "";
  chatDraft = "";
  localStorage.removeItem("vibyra.desktop.chatDraft");
  input.value = "";
  chatSending = true;
  render();
  let transcriptDetails = { status: "failed" };
  try {
    const result = await requestDesktopChat({
      attachments,
      desktopActionContext: desktopActionContextForScope(actionContextScope),
      history,
      imageAttachments,
      model: requestModel,
      mode,
      projectId: project?.id || String(selectedProjectId || ""),
      profileContext: typeof desktopProfileContext === "function" ? desktopProfileContext() : null,
      prompt,
      provider: "local",
      reasoningEffort: requestEffort,
      skill: skillId,
      tool
    });
    const assistantResponse = result.reply || "I received an empty response from Vibyra AI.";
    pendingMessage.text = assistantResponse;
    pendingMessage.image = normalizeChatImage(result.image);
    pendingMessage.app = normalizeChatApp(result.app);
    pendingMessage.pending = false;
    updateActiveChatTitle(result.title, rawText);
    if (typeof runDesktopActions === "function" && Array.isArray(result.actions) && result.actions.length) {
      pendingMessage.text = await runDesktopActions(result.actions, { desktopActionContextScope: actionContextScope }) || pendingMessage.text;
    }
    transcriptDetails = {
      actions: result.actions,
      response: assistantResponse,
      result: pendingMessage.text,
      status: "completed"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vibyra AI chat failed. Try again.";
    transcriptDetails = { error: message, status: "failed" };
    if (isChatUsageLimitError(error)) {
      const pendingIndex = chatMessages.indexOf(pendingMessage);
      if (pendingIndex >= 0) chatMessages.splice(pendingIndex, 1);
      chatNotice = chatUsageLimitNotice(error);
    } else {
      pendingMessage.text = message;
      pendingMessage.pending = false;
    }
  } finally {
    try {
      await persistDesktopPromptOutcome(transcriptTurn, transcriptDetails, "desktop-chat", transcriptOptions);
    } catch (error) {
      chatNotice = {
        title: "Response log failed",
        message: error instanceof Error ? error.message : "Prompt outcome could not be saved.",
        resetAt: ""
      };
    }
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
    "Ask Vibyra to launch AI terminals with a count, model, effort, and explicit permissions."
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
