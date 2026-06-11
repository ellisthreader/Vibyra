function desktopPromptTranscriptMetadata(source, options = {}) {
  const terminal = options.terminal || null;
  const terminalId = options.terminalId || terminal?.id || "setup";
  const projectId = options.projectId !== undefined
    ? String(options.projectId || "")
    : typeof terminalAiProjectId === "function"
      ? terminalAiProjectId(terminal)
      : String((typeof currentProject === "function" ? currentProject()?.id : "") || selectedProjectId || "");
  return {
    projectId,
    projectName: options.projectName || (
      typeof terminalProjectLabel === "function" ? terminalProjectLabel(projectId) : projectId
    ),
    model: options.model || terminal?.model || "",
    sessionId: options.sessionId || desktopPromptTranscriptSessionId(source, terminalId),
    source,
    terminalId,
    terminalName: options.terminalName || terminal?.title || "Setup"
  };
}

function desktopPromptTranscriptSessionId(source, terminalId) {
  if (source === "desktop-chat" && typeof activeChatId === "string" && activeChatId) {
    return `desktop-chat:${activeChatId}`;
  }
  return `terminal:${terminalId || "setup"}`;
}

function desktopPromptTranscriptTarget(targetId) {
  if (!targetId || targetId === "setup" || typeof findTerminal !== "function") return null;
  return findTerminal(targetId);
}

async function persistDesktopPromptTranscript(text, source, options = {}) {
  const prompt = String(text || "");
  if (!prompt.trim()) return null;
  const response = await fetch("/desktop/prompt/transcript", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      ...desktopPromptTranscriptMetadata(source, options),
      prompt
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(result.error || "Prompt transcript could not be saved.");
  }
  return result;
}

async function persistDesktopPromptOutcome(turn, details = {}, source = "", options = {}) {
  if (!turn?.turnId) return null;
  const response = await fetch("/desktop/prompt/transcript", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      ...desktopPromptTranscriptMetadata(source, options),
      actions: details.actions,
      durationMs: Math.max(0, Date.now() - Date.parse(turn.startedAt || "")),
      error: String(details.error || ""),
      event: "outcome",
      response: String(details.response || ""),
      result: String(details.result || ""),
      sessionId: turn.sessionId,
      startedAt: turn.startedAt,
      status: String(details.status || "completed"),
      turnId: turn.turnId
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(result.error || "Prompt outcome could not be saved.");
  }
  return result;
}
