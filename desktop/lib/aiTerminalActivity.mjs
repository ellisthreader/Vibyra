const CODEX_SPINNER = /^[\u2800-\u28ff]\s/;
const CODEX_IDLE_PLACEHOLDERS = [
  "Explain this codebase",
  "Summarize recent commits",
  "Implement {feature}",
  "Find and fix a bug in @filename",
  "Write tests for @filename",
  "Improve documentation in @filename",
  "Run /review on my current changes"
];

export function providerActivitySignal(agent, output) {
  const value = String(output || "");
  if (!value) return "";
  if (agent === "codex") return codexActivitySignal(value);
  if (agent === "vibyra") {
    const nativeSignal = codexActivitySignal(value);
    if (nativeSignal) return nativeSignal;
    if (vibyraPromptReady(value)) return "ready";
  }
  const plain = plainTerminalOutput(value);
  if (agent === "claude" && (
    /Claude\s*Code\s*v?\d/i.test(plain) && /❯\s*(?:Try\b|$)/m.test(plain)
    || /(?:^|[\r\n])❯\s*$/m.test(plain)
  )) return "ready";
  if (agent === "gemini" && (
    /Do you trust the files in this folder\?/i.test(plain)
    || /Type your message or @path\/to\/file/i.test(plain)
    || /(?:^|[\r\n])>\s*$/m.test(plain)
  )) return "ready";
  return "";
}

function vibyraPromptReady(value) {
  const plain = plainTerminalOutput(value);
  return /Type your message or @path\/to\/file/i.test(plain)
    || /(?:^|[\r\n])(?:│\s*)?(?:[a-z0-9._-]+\s+)?[❯›>](?:\s+auto)?\s*$/i.test(plain);
}

function plainTerminalOutput(value) {
  return String(value)
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u00a0/g, " ");
}

function codexActivitySignal(value) {
  const titles = Array.from(value.matchAll(/\x1b\]0;([^\x07]*)\x07/g));
  const latestTitle = titles.at(-1)?.[1] || "";
  if (latestTitle) return CODEX_SPINNER.test(latestTitle) ? "busy" : "ready";
  return CODEX_IDLE_PLACEHOLDERS.some((placeholder) => value.includes(placeholder)) ? "ready" : "";
}
