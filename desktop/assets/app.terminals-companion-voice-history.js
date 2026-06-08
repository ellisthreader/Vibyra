const terminalVoiceThreads = {};
const terminalVoiceHistoryItems = 8;
const terminalVoiceHistoryChars = 3200;

function terminalVoiceThread(terminal = terminalCompanionActiveTerminal()) {
  const key = terminal?.id || "setup";
  if (!terminalVoiceThreads[key]) terminalVoiceThreads[key] = [];
  return terminalVoiceThreads[key];
}

function terminalVoiceHistory(terminal) {
  return terminalVoiceThread(terminal).map(({ role, text }) => ({ role, text }));
}

function rememberTerminalVoiceTurn(terminal, prompt, reply) {
  const thread = terminalVoiceThread(terminal);
  thread.push(
    { role: "user", text: String(prompt || "").slice(0, 1200) },
    { role: "assistant", text: String(reply || "").slice(0, 1600) }
  );
  while (thread.length > terminalVoiceHistoryItems || terminalVoiceHistoryLength(thread) > terminalVoiceHistoryChars) {
    thread.splice(0, Math.min(2, thread.length));
  }
}

function terminalVoiceHistoryLength(thread) {
  return thread.reduce((total, item) => total + String(item.text || "").length, 0);
}
