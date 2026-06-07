const TERMINAL_VERBS = /\b(open|launch|start|create|spawn|run)\b/i;
const TERMINAL_NOUN = /\b(?:ai\s+)?terminals?\b/i;
const FULL_ACCESS = /\b(full permissions?|full access|danger(?:ously)? full access|no sandbox|without (?:a )?sandbox|bypass (?:all )?approvals?)\b/i;
const NUMBER_WORDS = new Map([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12]
]);

export function desktopActionsForPrompt(prompt, context = {}) {
  const text = String(prompt || "").trim();
  if (!text) return null;

  const companion = companionAction(text);
  if (companion) return actionResult(companion, companionReply(companion.mode));

  if (!TERMINAL_VERBS.test(text) || !TERMINAL_NOUN.test(text)) return null;
  const action = {
    type: "open_terminals",
    count: terminalCount(text),
    model: terminalModel(text),
    effort: terminalEffort(text),
    permissionMode: FULL_ACCESS.test(text) ? "full" : "standard",
    projectId: String(context.projectId || "")
  };
  return actionResult(action, terminalReply(action));
}

function companionAction(text) {
  const normalized = text.toLowerCase();
  if (normalized === "/voice" || /\b(open|show|start)\b.*\b(?:vibyra\s+)?voice\b/i.test(text)) {
    return { type: "open_terminal_companion", mode: "voice" };
  }
  if (normalized === "/memory" || normalized === "/memories" || /\b(open|show)\b.*\b(?:project\s+|vibyra\s+)?memor(?:y|ies)\b/i.test(text)) {
    return { type: "open_terminal_companion", mode: "memory" };
  }
  return null;
}

function terminalCount(text) {
  const numeric = text.match(/\b(\d{1,2})\s+(?:[a-z0-9.]+\s+){0,3}(?:ai\s+)?terminals?\b/i);
  if (numeric) return clampCount(numeric[1]);
  const word = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:[a-z0-9.]+\s+){0,3}(?:ai\s+)?terminals?\b/i);
  return word ? NUMBER_WORDS.get(word[1].toLowerCase()) : 1;
}

function terminalModel(text) {
  const normalized = text.toLowerCase().replace(/_/g, "-");
  const version = normalized.match(/\b(?:gpt|codex)?[\s-]*(5(?:\.\d+)?)(?:[\s-]*(mini|nano|codex))?\b/);
  if (version) {
    const suffix = version[2] ? `-${version[2]}` : "";
    return `gpt-${version[1]}${suffix}`;
  }
  if (/\bcodex\b/.test(normalized)) return "gpt-5-codex";
  if (/\bclaude\b/.test(normalized)) return "claude-sonnet-4";
  if (/\bgemini\b/.test(normalized)) return "gemini-2.5-pro";
  return "auto";
}

function terminalEffort(text) {
  if (/\b(fast|quick|low effort|low reasoning)\b/i.test(text)) return "low";
  if (/\b(extra high|xhigh|maximum reasoning)\b/i.test(text)) return "xhigh";
  if (/\b(high effort|deep reasoning)\b/i.test(text)) return "high";
  return "medium";
}

function terminalReply(action) {
  const count = action.count;
  const model = modelLabel(action.model);
  const speed = action.effort === "low" ? " in fast mode" : "";
  const access = action.permissionMode === "full" ? " with full access" : "";
  return `Opening ${count} ${model} terminal${count === 1 ? "" : "s"}${speed}${access}. You can watch them live in Terminals; Voice and Memory are in the terminal toolbar.`;
}

function companionReply(mode) {
  return `Opening Vibyra ${mode === "voice" ? "Voice" : "Memory"} beside the live terminal workspace.`;
}

function modelLabel(model) {
  if (model === "auto") return "AI";
  if (model === "gpt-5-codex") return "Codex";
  return model.toUpperCase().replace("GPT-", "GPT-");
}

function actionResult(action, reply) {
  return {
    ok: true,
    reply,
    title: action.type === "open_terminals" ? "Launch AI terminals" : `Open Vibyra ${action.mode}`,
    actions: [action]
  };
}

function clampCount(value) {
  const count = Number.parseInt(String(value || ""), 10);
  return Math.min(12, Math.max(1, Number.isFinite(count) ? count : 1));
}
