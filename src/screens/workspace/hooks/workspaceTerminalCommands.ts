export const TERMINAL_COMMANDS = ["git status", "npm install", "npm run dev", "npm run build", "npm test", "pytest"] as const;
const APPROVAL_COMMANDS = new Set<string>(["npm install", "npm run dev", "npm run build", "npm test", "pytest"]);

export type SupportedTerminalCommand = typeof TERMINAL_COMMANDS[number];

export function parseTerminalCommandIntent(prompt: string): SupportedTerminalCommand | null {
  const text = prompt.trim().toLowerCase();
  if (!/\b(run|execute|terminal|command|shell)\b/.test(text)) return null;
  const quoted = prompt.match(/[`"']([^`"']{3,80})[`"']/)?.[1]?.trim().toLowerCase();
  const source = quoted || text.replace(/^(please|pls|can you|could you|would you|vibyra)\s+/i, "");
  if (/\b(run|execute)\b.*\btests?\b/.test(source)) return "npm test";
  if (/\b(run|execute)\b.*\bbuild\b/.test(source)) return "npm run build";
  if (/\b(run|start)\b.*\b(dev|server)\b/.test(source)) return "npm run dev";
  return TERMINAL_COMMANDS.find((command) => source.includes(command)) ?? null;
}

export function needsTerminalApproval(command: string) {
  return APPROVAL_COMMANDS.has(command);
}

export function isTerminalApproval(prompt: string) {
  return /^(yes|yeah|yep|ok|okay|approve|approved|run it|do it|confirm)\b/i.test(prompt.trim());
}

export function isTerminalDenial(prompt: string) {
  return /^(no|nope|nah|cancel|stop|deny|denied|don'?t)\b/i.test(prompt.trim());
}

export function unsupportedTerminalReply() {
  return `I can run these project commands through Vibyra Desktop: ${TERMINAL_COMMANDS.map((command) => `\`${command}\``).join(", ")}.`;
}

export function commandOutputReply(command: string, ok: boolean, output: string) {
  const trimmed = output.trim() || "Command finished with no output.";
  const capped = trimmed.length > 2400 ? `${trimmed.slice(0, 2400)}\n...output truncated` : trimmed;
  return `${ok ? "Command finished" : "Command failed"}: \`${command}\`\n\n\`\`\`\n${capped}\n\`\`\``;
}
