import {
  promptLabelForModel,
  renderIntroForModel
} from "./aiTerminalOpenRouterCli.mjs";
import { renderAutoDecidingFrame } from "./aiTerminalVibyraLogo.mjs";

export const AUTO_DECIDING_FRAME_INTERVAL_MS = 240;
export const AUTO_DECIDING_MINIMUM_MS = 1_440;

export function autoTerminalWaitingOutput({ cwd, cols, error = "" }) {
  const safeError = String(error || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
  const intro = renderIntroForModel({
    modelKey: "auto",
    cwd,
    columns: cols,
    color: true
  });
  const message = safeError ? `\r\n\x1b[31m${safeError}\x1b[0m` : "";
  return `${intro}${message}\r\n\x1b[?2004h${promptLabelForModel("auto", true)}`;
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

export function autoTerminalDecidingStart({ cols, rows, phase = 0 } = {}) {
  const lines = renderAutoDecidingFrame({
    columns: cols,
    rows,
    color: true,
    phase
  });
  return {
    lineCount: lines.length,
    output: `\x1b[?2004l\x1b[?25l\x1b[3J\x1b[2J\x1b[H${paintFrame(lines)}\x1b[J`
  };
}

export function autoTerminalDecidingUpdate({ cols, rows, phase = 0 } = {}) {
  const lines = renderAutoDecidingFrame({
    columns: cols,
    rows,
    color: true,
    phase
  });
  return `\x1b[H${paintFrame(lines)}\x1b[J`;
}

export function autoTerminalDecidingStop() {
  return "\x1b[0m\x1b[?25h";
}

export function autoTerminalDecidingHandoff() {
  return "\x1b[0m\x1b[?25h\x1b[3J\x1b[2J\x1b[H";
}

function paintFrame(lines) {
  return lines.map((line) => `\x1b[2K${line}`).join("\r\n");
}
