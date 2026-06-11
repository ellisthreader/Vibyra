const terminalVoiceStyleInstruction = "For voice: answer concisely in natural spoken language. Avoid markdown, lists, and code unless they are necessary.";

async function requestTerminalVoiceReply(prompt, terminal, generation) {
  const actionContextScope = desktopActionContextScope("terminal", terminal?.id || "setup");
  const result = await requestDesktopChat({
    attachments: [],
    desktopActionContext: desktopActionContextForScope(actionContextScope),
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
  const reply = await terminalVoiceResultText(result, actionContextScope);
  if (!terminalVoiceGenerationCurrent(generation)) throw new Error("Voice request cancelled.");
  return { reply, result };
}

function terminalVoiceProfileContext() {
  const profile = typeof desktopProfileContext === "function" ? desktopProfileContext() : {};
  return {
    ...profile,
    responseStyle: [terminalVoiceStyleInstruction, profile?.responseStyle].filter(Boolean).join(" ")
  };
}

async function terminalVoiceResultText(result, actionContextScope = desktopActionContextScope("terminal", terminalCompanionActiveTerminal()?.id || "setup")) {
  if (Array.isArray(result?.actions) && result.actions.length) {
    if (typeof runDesktopActions !== "function") {
      throw new Error("Desktop actions are unavailable. Reload Vibyra Desktop and try again.");
    }
    terminalVoiceState.actionInFlight = true;
    try {
      const summary = await runDesktopActions(result.actions, { desktopActionContextScope: actionContextScope });
      if (!summary) throw new Error("Vibyra AI returned an unsupported desktop action.");
      const targetScope = desktopActionContextScope("terminal", terminalCompanionActiveTerminal()?.id || "setup");
      if (typeof transferDesktopActionContext === "function") {
        transferDesktopActionContext(actionContextScope, targetScope);
      }
      return summary;
    } finally {
      terminalVoiceState.actionInFlight = false;
    }
  }
  const reply = String(result?.reply || "").trim();
  if (!reply) throw new Error("Vibyra AI returned an empty response.");
  return reply;
}
