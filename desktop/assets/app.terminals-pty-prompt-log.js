const terminalPtyPromptStates = Object.create(null);
const terminalPtyInputQueues = Object.create(null);
const terminalPtyTranscriptTurns = Object.create(null);
const terminalPtyTranscriptIdleMs = 4_000;

function terminalPtyCompletedPrompts(id, input) {
  const state = terminalPtyPromptStates[id] || { bracketed: false, text: "" };
  terminalPtyPromptStates[id] = state;
  const prompts = [];
  const data = String(input || "");
  for (let index = 0; index < data.length;) {
    if (data.startsWith("\x1b[200~", index)) {
      state.bracketed = true;
      index += 6;
      continue;
    }
    if (data.startsWith("\x1b[201~", index)) {
      state.bracketed = false;
      index += 6;
      continue;
    }
    const character = data[index];
    if (state.bracketed) {
      state.text += character === "\r" ? "\n" : character;
      index += 1;
      continue;
    }
    if (character === "\r" || character === "\n") {
      if (state.text.trim()) prompts.push(state.text);
      state.text = "";
      if (character === "\r" && data[index + 1] === "\n") index += 1;
      index += 1;
      continue;
    }
    if (character === "\x7f" || character === "\b") {
      state.text = Array.from(state.text).slice(0, -1).join("");
      index += 1;
      continue;
    }
    if (character === "\x03" || character === "\x15") {
      state.text = "";
      index += 1;
      continue;
    }
    if (character === "\x1b") {
      index = terminalPtySkipEscapeSequence(data, index);
      continue;
    }
    if (character === "\t" || character >= " ") state.text += character;
    index += 1;
  }
  return prompts;
}

function terminalPtySkipEscapeSequence(data, start) {
  if (data[start + 1] !== "[") return Math.min(data.length, start + 2);
  let index = start + 2;
  while (index < data.length && !/[A-Za-z~]/.test(data[index])) index += 1;
  return Math.min(data.length, index + 1);
}

function queueTerminalPtyInput(id, prompts, deliver) {
  const run = async () => {
    const terminal = findTerminal(id);
    for (const prompt of prompts) {
      const turn = await persistDesktopPromptTranscript(prompt, "terminal-pty", {
        model: terminal?.model || "",
        sessionId: `terminal-pty:${id}`,
        terminal
      });
      terminalPtyTrackTurn(id, prompt, turn, "terminal-pty");
    }
    deliver();
  };
  const previous = terminalPtyInputQueues[id];
  if (!previous && !prompts.length) {
    deliver();
    return;
  }
  const queued = (previous || Promise.resolve())
    .then(run)
    .catch((error) => {
      setPtyInputNotice(id, error instanceof Error ? error.message : "Prompt transcript could not be saved.");
    })
    .finally(() => {
      if (terminalPtyInputQueues[id] === queued) delete terminalPtyInputQueues[id];
    });
  terminalPtyInputQueues[id] = queued;
}

function terminalPtyTrackTurn(id, prompt, turn, source = "terminal-pty") {
  if (!id || !turn?.turnId) return;
  const turns = terminalPtyTranscriptTurns[id] || [];
  terminalPtyTranscriptTurns[id] = turns;
  turns.push({
    completing: false,
    idleTimer: null,
    output: "",
    prompt: String(prompt || ""),
    source: source || "terminal-pty",
    turn
  });
}

function terminalPtyTranscriptOutput(terminal, data, previousState) {
  const active = terminalPtyTranscriptTurns[terminal?.id]?.[0];
  if (!active || active.completing) return;
  const output = terminalPtyTranscriptText(data);
  if (output) active.output = `${active.output}${output}`.slice(-60_000);
  clearTimeout(active.idleTimer);
  if (previousState === "busy" && terminal.providerState === "ready") {
    void terminalPtyCompleteTurn(terminal, "completed");
    return;
  }
  if (output.trim()) {
    active.idleTimer = setTimeout(() => {
      void terminalPtyCompleteTurn(terminal, "completed");
    }, terminalPtyTranscriptIdleMs);
  }
}

function terminalPtyTranscriptExit(terminal, exitCode) {
  const status = Number(exitCode) === 0 ? "completed" : "failed";
  void terminalPtyCompleteTurn(terminal, status, Number.isFinite(Number(exitCode))
    ? `Terminal exited with code ${Number(exitCode)}.`
    : "Terminal exited.");
}

async function terminalPtyCompleteTurn(terminal, status, error = "") {
  const turns = terminalPtyTranscriptTurns[terminal?.id];
  const active = turns?.[0];
  if (!active || active.completing) return;
  active.completing = true;
  clearTimeout(active.idleTimer);
  try {
    await persistDesktopPromptOutcome(active.turn, {
      error: status === "failed" ? error : "",
      result: active.output.trim() || (status === "completed" ? "Terminal command completed." : ""),
      status
    }, active.source, {
      model: terminal?.model || "",
      sessionId: active.turn.sessionId,
      terminal
    });
    turns.shift();
    if (!turns.length) delete terminalPtyTranscriptTurns[terminal.id];
  } catch (completionError) {
    active.completing = false;
    setPtyInputNotice(
      terminal.id,
      completionError instanceof Error ? completionError.message : "Prompt outcome could not be saved."
    );
  }
}

function terminalPtyTranscriptText(value) {
  const plain = typeof terminalPlainActivityOutput === "function"
    ? terminalPlainActivityOutput(value)
    : String(value)
      .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  return plain
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}
