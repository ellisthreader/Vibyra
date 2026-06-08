const terminalVoiceStyleInstruction = "For voice: answer concisely in natural spoken language. Avoid markdown, lists, and code unless they are necessary.";

async function requestTerminalVoiceReply(prompt, terminal, generation) {
  const result = await requestDesktopChat({
    attachments: [],
    history: terminalVoiceHistory(terminal),
    mode: "chat",
    model: terminal?.model || selectedSetupModel()?.key || "auto",
    provider: "local",
    profileContext: terminalVoiceProfileContext(),
    projectId: terminalAiProjectId(terminal),
    prompt,
    reasoningEffort: terminal?.effort || reasoningEffort || "medium",
    skill: "",
    terminalId: terminal?.id || "",
    tool: ""
  });
  if (!terminalVoiceGenerationCurrent(generation)) throw new Error("Voice request cancelled.");
  const reply = await terminalVoiceResultText(result);
  if (!terminalVoiceGenerationCurrent(generation)) throw new Error("Voice request cancelled.");
  return reply;
}

function terminalVoiceProfileContext() {
  const profile = typeof desktopProfileContext === "function" ? desktopProfileContext() : {};
  return {
    ...profile,
    responseStyle: [terminalVoiceStyleInstruction, profile?.responseStyle].filter(Boolean).join(" ")
  };
}

async function terminalVoiceResultText(result) {
  if (Array.isArray(result?.actions) && result.actions.length) {
    if (typeof runDesktopActions !== "function") {
      throw new Error("Desktop actions are unavailable. Reload Vibyra Desktop and try again.");
    }
    terminalVoiceState.actionInFlight = true;
    try {
      const summary = await runDesktopActions(result.actions);
      if (!summary) throw new Error("Vibyra AI returned an unsupported desktop action.");
      return summary;
    } finally {
      terminalVoiceState.actionInFlight = false;
    }
  }
  const reply = String(result?.reply || "").trim();
  if (!reply) throw new Error("Vibyra AI returned an empty response.");
  return reply;
}
