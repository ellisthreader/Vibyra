const terminalAiChatThreads = {};

function terminalAiChatThread(terminal = terminalCompanionActiveTerminal()) {
  const key = terminal?.id || "setup";
  if (!terminalAiChatThreads[key]) terminalAiChatThreads[key] = { draft: "", messages: [], sending: false };
  return terminalAiChatThreads[key];
}

function terminalAiChatHtml() {
  const thread = terminalAiChatThread();
  const terminal = terminalCompanionActiveTerminal();
  const rows = thread.messages.length
    ? thread.messages.map(terminalAiChatMessageHtml).join("")
    : terminalAiChatEmptyHtml(terminal);
  return `<div class="terminal-ai-chat">
    <div class="terminal-ai-chat-messages" data-terminal-ai-messages>${rows}</div>
    <form class="terminal-ai-chat-composer" data-terminal-ai-form>
      <textarea rows="2" data-terminal-ai-input placeholder="Ask Vibyra AI..." ${thread.sending ? "disabled" : ""}>${escapeHtml(thread.draft)}</textarea>
      <div class="terminal-ai-chat-composer-foot">
        <button class="terminal-ai-chat-voice" type="button" data-terminal-companion-open="voice" aria-label="Talk to Vibyra" title="Talk to Vibyra (Alt+V)">${icon("pulse")}</button>
        <button type="submit" aria-label="Send to Vibyra AI" ${thread.sending || !thread.draft.trim() ? "disabled" : ""}>${icon("send")}</button>
      </div>
    </form>
  </div>`;
}

function terminalAiChatEmptyHtml(terminal) {
  return `<div class="terminal-ai-chat-empty">
    <div class="terminal-ai-chat-intro">
      <span class="terminal-ai-chat-avatar"><img src="/app-assets/vibyra.png" alt="" /></span>
      <div><strong>How can I help?</strong><p>Ask Vibyra to work across your projects, terminals, and desktop.</p></div>
    </div>
    <div class="terminal-ai-chat-starters" aria-label="Suggested prompts">
      <button type="button" data-terminal-ai-prompt="Review my current Vibyra workspace and suggest the most useful next step.">${icon("chat")}<span><strong>Plan my next step</strong><small>Review the workspace and suggest what to do</small></span>${icon("chevron")}</button>
      <button type="button" data-terminal-ai-prompt="Check my projects and active work for errors, then suggest the safest fixes.">${icon("search")}<span><strong>Check my work</strong><small>Find issues across projects and active tasks</small></span>${icon("chevron")}</button>
    </div>
  </div>`;
}

function terminalAiChatMessageHtml(message) {
  const assistant = message.role === "assistant";
  const pending = Boolean(message.pending);
  return `<div class="terminal-ai-chat-message ${assistant ? "assistant" : "user"}${pending ? " pending" : ""}">
    ${assistant ? `<span class="terminal-ai-chat-avatar"><img src="/app-assets/vibyra.png" alt="" /></span>` : ""}
    ${pending ? `<p aria-label="Vibyra AI is thinking"><i></i><i></i><i></i></p>` : `<p>${escapeHtml(message.text)}</p>`}
  </div>`;
}

function bindTerminalAiChat(root = document) {
  const thread = terminalAiChatThread();
  const form = root?.querySelector?.("[data-terminal-ai-form]");
  const input = root?.querySelector?.("[data-terminal-ai-input]");
  const submit = form?.querySelector?.('button[type="submit"]');
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendTerminalAiChat(input);
  });
  input?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    form?.requestSubmit();
  });
  input?.addEventListener("input", () => {
    thread.draft = input.value;
    if (submit) submit.disabled = thread.sending || !thread.draft.trim();
    fitTerminalAiChatInput(input);
  });
  root?.querySelectorAll?.("[data-terminal-ai-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!input) return;
      input.value = button.dataset.terminalAiPrompt || "";
      thread.draft = input.value;
      if (submit) submit.disabled = false;
      fitTerminalAiChatInput(input);
      input.focus();
    });
  });
  requestAnimationFrame(() => {
    const messages = root?.querySelector?.("[data-terminal-ai-messages]");
    messages?.scrollTo?.(0, messages.scrollHeight);
    fitTerminalAiChatInput(input);
    input?.focus?.();
  });
}

function fitTerminalAiChatInput(input) {
  if (!input) return;
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
}

async function sendTerminalAiChat(input) {
  const prompt = String(input?.value || "").trim();
  if (!prompt) return;
  await sendTerminalAiPrompt(prompt, "chat");
}

async function sendTerminalAiPrompt(prompt, source = "chat") {
  const terminal = terminalCompanionActiveTerminal();
  const thread = terminalAiChatThread(terminal);
  if (thread.sending) return "";
  const userMessage = { role: "user", text: prompt };
  const pending = { role: "assistant", text: "", pending: true };
  const history = thread.messages.slice(-8).map(({ role, text }) => ({ role, text }));
  thread.messages.push(userMessage, pending);
  thread.draft = "";
  thread.sending = true;
  syncTerminalCompanion(source);
  try {
    const model = terminal?.model || selectedSetupModel()?.key || "auto";
    const result = await requestDesktopChat({
      attachments: [],
      history,
      mode: "chat",
      model,
      provider: "local",
      profileContext: typeof desktopProfileContext === "function" ? desktopProfileContext() : null,
      projectId: terminalAiProjectId(terminal),
      prompt,
      reasoningEffort: terminal?.effort || reasoningEffort || "medium",
      skill: "",
      terminalId: terminal?.id || "",
      tool: ""
    });
    pending.text = await terminalAiChatResultText(result);
    moveTerminalAiActionMessages(thread, userMessage, pending);
  } catch (error) {
    pending.text = error instanceof Error ? error.message : "Vibyra AI could not reply.";
  } finally {
    pending.pending = false;
    thread.sending = false;
    syncTerminalCompanion(source);
  }
  return pending.text;
}

function terminalAiProjectId(terminal) {
  if (terminal) return String(terminal.projectId || "");
  if (typeof terminalProjectForSetup === "function") {
    return String(terminalProjectForSetup() || "");
  }
  return String(currentProject()?.id || selectedProjectId || "");
}

async function terminalAiChatResultText(result) {
  const fallback = result.reply || "I received an empty response from Vibyra AI.";
  if (!Array.isArray(result.actions) || !result.actions.length) return fallback;
  if (typeof runDesktopActions !== "function") {
    throw new Error("Desktop actions are unavailable. Reload Vibyra Desktop and try again.");
  }
  const summary = await runDesktopActions(result.actions);
  if (!summary) throw new Error("Vibyra AI returned an unsupported desktop action.");
  return summary;
}

function moveTerminalAiActionMessages(sourceThread, userMessage, assistantMessage) {
  const targetThread = terminalAiChatThread();
  if (targetThread === sourceThread) return;
  sourceThread.messages = sourceThread.messages.filter((message) => message !== userMessage && message !== assistantMessage);
  targetThread.messages.push(userMessage, assistantMessage);
}
