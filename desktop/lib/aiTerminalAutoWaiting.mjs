import {
  promptLabelForModel,
  renderIntroForModel
} from "./aiTerminalOpenRouterCli.mjs";

export function autoTerminalWaitingOutput({ cwd, cols }) {
  return `${renderIntroForModel({
    modelKey: "auto",
    cwd,
    columns: cols,
    color: true
  })}\r\n\x1b[?2004h${promptLabelForModel("auto", true)}`;
}

export function consumeAutoTerminalInput(state = {}, input = "") {
  let buffer = String(state.buffer || "");
  let pasteMode = Boolean(state.pasteMode);
  let output = "";
  let prompt = "";
  const value = String(input || "");

  for (let index = 0; index < value.length; index += 1) {
    if (value.startsWith("\x1b[200~", index)) {
      pasteMode = true;
      index += 5;
      continue;
    }
    if (value.startsWith("\x1b[201~", index)) {
      pasteMode = false;
      index += 5;
      continue;
    }

    const character = value[index];
    if (character === "\x03") {
      buffer = "";
      output += "^C\r\n";
      continue;
    }
    if (character === "\x7f" || character === "\b") {
      if (buffer) {
        buffer = buffer.slice(0, -1);
        output += "\b \b";
      }
      continue;
    }
    if (character === "\r" || character === "\n") {
      if (character === "\n" && value[index - 1] === "\r") continue;
      if (pasteMode) {
        buffer += "\n";
        output += "\r\n";
        continue;
      }
      output += "\r\n";
      prompt = buffer.trim();
      buffer = "";
      break;
    }
    if (character === "\t" || character >= " ") {
      buffer += character;
      output += character;
    }
  }

  return {
    buffer: buffer.slice(0, 8_000),
    pasteMode,
    output,
    prompt
  };
}

export function autoTerminalPrompt() {
  return promptLabelForModel("auto", true);
}
