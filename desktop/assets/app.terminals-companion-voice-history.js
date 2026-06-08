const terminalVoiceThreads = {};
const terminalVoiceHistoryItems = 8;
const terminalVoiceHistoryChars = 3200;

function terminalVoiceThread(terminal = terminalCompanionActiveTerminal()) {
  return terminalVoiceThreadById(terminal?.id || "setup");
}

function terminalVoiceThreadById(key) {
  if (!terminalVoiceThreads[key]) terminalVoiceThreads[key] = [];
  return terminalVoiceThreads[key];
}

function terminalVoiceHistory(terminal) {
  return terminalVoiceThread(terminal).map(({ role, text }) => ({ role, text }));
}

function rememberTerminalVoiceTurn(terminal, prompt, reply) {
  appendTerminalVoiceMessage(terminal, "user", prompt);
  appendTerminalVoiceMessage(terminal, "assistant", reply);
}

function appendTerminalVoiceMessage(terminal, role, text) {
  const thread = terminalVoiceThread(terminal);
  thread.push({
    role: role === "assistant" ? "assistant" : "user",
    text: String(text || "").slice(0, role === "assistant" ? 1600 : 1200)
  });
  trimTerminalVoiceThread(thread);
}

function transferTerminalVoiceThread(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return;
  const source = terminalVoiceThreadById(fromId);
  if (!source.length) return;
  const target = terminalVoiceThreadById(toId);
  target.push(...source);
  source.splice(0, source.length);
  trimTerminalVoiceThread(target);
}

function trimTerminalVoiceThread(thread) {
  while (thread.length > terminalVoiceHistoryItems || terminalVoiceHistoryLength(thread) > terminalVoiceHistoryChars) {
    thread.splice(0, Math.min(2, thread.length));
  }
}

function terminalVoiceHistoryLength(thread) {
  return thread.reduce((total, item) => total + String(item.text || "").length, 0);
}

function terminalVoiceConversationHtml(terminal = terminalCompanionActiveTerminal()) {
  const messages = terminalVoiceThread(terminal);
  const rows = messages.length
    ? messages.map(terminalVoiceMessageHtml).join("")
    : `<p class="terminal-voice-conversation-empty">Your transcribed conversation will appear here.</p>`;
  return `<section class="terminal-voice-conversation" aria-label="Voice conversation">
    <div class="terminal-voice-conversation-head">
      <strong>Conversation</strong>
      <span>${messages.length ? `${Math.ceil(messages.length / 2)} turn${messages.length > 2 ? "s" : ""}` : "Ready"}</span>
    </div>
    <div class="terminal-voice-conversation-list" data-terminal-voice-conversation>${rows}</div>
  </section>`;
}

function terminalVoiceMessageHtml(message) {
  const assistant = message.role === "assistant";
  return `<article class="terminal-voice-message ${assistant ? "assistant" : "user"}">
    <span>${assistant ? "Vibyra" : "You"}</span>
    <p>${escapeHtml(message.text)}</p>
  </article>`;
}

function scrollTerminalVoiceConversation(root = document) {
  const list = root?.querySelector?.("[data-terminal-voice-conversation]");
  if (list) requestAnimationFrame(() => list.scrollTo?.(0, list.scrollHeight));
}
