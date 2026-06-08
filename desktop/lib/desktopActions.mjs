const TERMINAL_VERBS = /\b(open|launch|start|create|spawn|run)\b/i;
const TERMINAL_CLOSE_VERBS = /\b(close|stop|end|remove|quit)\b/i;
const TERMINAL_CLOSE_INTENT = /\b(?:close|stop|end|remove|quit)\s+(?:(?:all|every|this|the|active|current|\d{1,2})\s+){0,2}(?:ai\s+)?terminals?\b/i;
const TERMINAL_PERMISSION_VERBS = /\b(give|grant|set|enable|switch|change|upgrade|relaunch|restart)\b/i;
const TERMINAL_NOUN = /\b(?:ai\s+)?(?:terminals?|termianls?|teminals?|termnals?)\b/i;
const TERMINAL_TASK_VERBS = /\b(assign|delegate|distribute|run)\b/i;
const GIVE_TERMINAL_TASK_COMMAND = /\bgive\s+(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+of\s+(?:them|those|these|(?:the\s+)?(?:\d{1,2}\s+)?terminals?)\s+(?:the\s+)?(?:jobs?|tasks?)\b/i;
const TERMINAL_TASK_SCOPE = /\b(?:each|separate|different|multiple)\s+terminals?\b|\bacross\s+(?:the\s+)?(?:multiple\s+)?terminals?\b/i;
const COUNTED_TERMINAL_TASK_COMMAND = /\b(?:assign|delegate|distribute)\s+(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:ai\s+)?terminals?\s+to\b/i;
const TERMINAL_SUBAGENT_NOUN = /\bsub-?agents?\b/i;
const TERMINAL_SUBAGENT_COMMAND = /^(?:(?:still not working|try again|again|please|pls)\b[\s,!]*)*(?:can you\s+)?(?:assign|delegate|distribute|run)\b/i;
const TERMINAL_WORK_NOUN = /\b(?:tasks?|jobs?|sub-?agents?)\b/i;
const EXISTING_TERMINAL_SCOPE = /\b(?:all|every|each|these|those|existing|current|open)(?:\s+\d{1,2})?\s+terminals?\b|\b(?:all|every|each)\s+of\s+(?:the\s+)?terminals?\b|\bterminals?\s+(?:are\s+)?open\b|\bterminals?\s+you\s+(?:just\s+)?opened\b|\b\d{1,2}\s+of\s+(?:them|those|these|(?:the\s+)?(?:\d{1,2}\s+)?terminals?)\b/i;
const IMPLICIT_TERMINAL_MODEL = /^\s*(?:open|launch|start|create|spawn|run)\s+(?:(?:an?|one)\s+)?(?:(?:open\s*ai|openai|ai|gpt|codex|claude|gemini)(?:[\s-]*\d+(?:\.\d+)?)?(?:\s+pro)?)\s*[.!]?\s*$/i;
const FULL_ACCESS = /\b(full[- ]permissions?|full[- ]access|danger(?:ously)? full access|no sandbox|without (?:a )?sandbox|bypass (?:all )?approvals?)\b/i;
const NEGATED_FULL_ACCESS = /\b(?:no|without|except|disable|remove|revoke)\b.{0,32}\bfull[- ](?:access|permissions?)\b|\bfull[- ](?:access|permissions?)\b.{0,20}\b(?:off|disabled)\b/i;
const NON_ACTION_PREFIX = /^\s*(?:explain|describe|tell me how|write (?:an?|the) example|give me an example|show me an example|can you (?:explain|describe|tell|show)|how (?:do|can|would|to)|what (?:does|would|happens?)|why|should (?:we|i)|is it possible|if i|when\b|test whether|i might|the ui says|we need copy|add (?:an?\s+)?button)\b/i;
const NON_ACTION_TERMINAL_TOPIC = /\bterminals?\s+(?:documentation|docs|guide|definition|settings?|example|prompt)\b/i;
const NEGATED_ACTION = /\b(?:do not|don't|dont|never)\s+(?:\w+\s+){0,3}(?:open|launch|start|create|spawn|run|assign|delegate|distribute|close|stop|end|remove|quit|give|grant|set|enable|switch|change|upgrade|relaunch|restart)\b/i;
const NUMBER_WORDS = new Map(Object.entries({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12
}));

export function desktopActionsForPrompt(prompt, context = {}) {
  const text = String(prompt || "").trim();
  if (!text) return null;
  if (NON_ACTION_PREFIX.test(text) || NON_ACTION_TERMINAL_TOPIC.test(text) || NEGATED_ACTION.test(text)) return null;

  const companion = companionAction(text);
  if (companion) return actionResult(companion, companionReply(companion.mode));

  const permissions = terminalPermissionAction(text, context);
  if (permissions) return actionResult(permissions, terminalPermissionReply(permissions));

  const close = terminalCloseAction(text, context);
  if (close) return actionResult(close, terminalCloseReply(close));

  const terminalTasks = terminalTaskAction(text, context);
  if (terminalTasks) return actionResult(terminalTasks, terminalTaskReply(terminalTasks));
  if (terminalTaskIntent(text)) return null;

  if (!TERMINAL_VERBS.test(text) || (!TERMINAL_NOUN.test(text) && !IMPLICIT_TERMINAL_MODEL.test(text))) return null;
  const settings = terminalSettings(text, context);
  const action = { type: "open_terminals", count: terminalCount(text), ...settings };
  return actionResult(action, terminalReply(action));
}

function terminalTaskIntent(text) {
  return (TERMINAL_TASK_VERBS.test(text) || GIVE_TERMINAL_TASK_COMMAND.test(text))
    && (
      COUNTED_TERMINAL_TASK_COMMAND.test(text)
      ||
      (TERMINAL_SUBAGENT_NOUN.test(text) && TERMINAL_SUBAGENT_COMMAND.test(text))
      || (
        TERMINAL_NOUN.test(text)
        && (TERMINAL_TASK_SCOPE.test(text) || TERMINAL_WORK_NOUN.test(text))
      )
    );
}

function terminalTaskAction(text, context) {
  if (!terminalTaskIntent(text)) return null;
  const explicitTasks = listedTerminalTasks(text);
  const target = EXISTING_TERMINAL_SCOPE.test(text)
    ? "existing"
    : TERMINAL_SUBAGENT_NOUN.test(text) && /\b(?:still not working|try again|again)\b/i.test(text)
      ? "existing_then_new"
      : "new";
  const inferredCount = explicitTerminalTaskCount(text) || explicitTerminalCount(text) || (target === "existing" ? 12 : 3);
  const taskTexts = explicitTasks.length >= 2 ? explicitTasks : inferredTerminalTasks(text, inferredCount, context);
  if (taskTexts.length < 2) return null;
  const settings = terminalSettings(text, context);
  return {
    type: "run_terminal_tasks",
    ...(target === "new" ? {} : { target }),
    ...settings,
    tasks: taskTexts.slice(0, 12).map((task) => ({ task }))
  };
}

function listedTerminalTasks(text) {
  const tasks = String(text).split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*(?:[-*+]|\d{1,2}[.)])\s+(.+?)\s*$/);
    return match ? [cleanTask(match[1])] : [];
  }).filter(Boolean);
  if (tasks.length) return tasks;

  const inline = [];
  const pattern = /(?:^|\s)\d{1,2}[.)]\s+(.+?)(?=(?:\s+\d{1,2}[.)]\s+)|$)/g;
  for (const match of text.matchAll(pattern)) inline.push(cleanTask(match[1]));
  return inline.filter(Boolean);
}

function inferredTerminalTasks(text, count = 3, context = {}) {
  if (!TERMINAL_WORK_NOUN.test(text) && !COUNTED_TERMINAL_TASK_COMMAND.test(text)) return [];
  const currentGoal = terminalTaskGoal(text);
  const goal = shouldReusePreviousTaskGoal(text, currentGoal)
    ? previousTerminalTaskGoal(context.history) || currentGoal
    : currentGoal;
  if (!goal) return [];
  const errorSearch = goal.match(/^(?:find(?:\s+and\s+diagnose)?|diagnose) (?:errors|bugs|issues) (?:on|in|for) (.+)$/i);
  if (errorSearch) {
    const subject = errorSearch[1];
    return [
      `Inspect ${subject} for errors`,
      `Run focused tests for ${subject}`,
      `Review relevant code paths for ${subject}`,
      `Reproduce user-facing failures in ${subject}`,
      `Audit state and lifecycle handling for ${subject}`,
      `Check error handling and recovery for ${subject}`,
      `Review permission boundaries for ${subject}`,
      `Check responsive and accessibility behavior for ${subject}`,
      `Review race conditions and performance risks for ${subject}`,
      `Inspect integration boundaries for ${subject}`,
      `Validate regression coverage for ${subject}`,
      `Summarize confirmed bugs and recommended fixes for ${subject}`
    ].slice(0, count);
  }
  return [
    `Investigate: ${goal}`,
    `Run focused tests for: ${goal}`,
    `Review relevant code paths for: ${goal}`,
    `Reproduce failures for: ${goal}`,
    `Audit state and lifecycle handling for: ${goal}`,
    `Check error handling and recovery for: ${goal}`,
    `Review permission boundaries for: ${goal}`,
    `Check responsive and accessibility behavior for: ${goal}`,
    `Review race conditions and performance risks for: ${goal}`,
    `Inspect integration boundaries for: ${goal}`,
    `Validate regression coverage for: ${goal}`,
    `Summarize confirmed bugs and recommended fixes for: ${goal}`
  ].slice(0, count);
}

function normalizeInferredTaskGoal(value) {
  return String(value || "")
    .replace(/\b(?:tereminal|termianl|teminal|termnal)\b/gi, "terminal")
    .replace(/\b(?:diagons(?:e|ing)|diagon(?:se|sing))\b/gi, (word) => /ing$/i.test(word) ? "diagnosing" : "diagnose")
    .replace(/\b(?:pls|please)\b[.!]*$/i, "")
    .trim();
}

function terminalTaskGoal(text) {
  const source = String(text || "");
  const countedAssignment = source.match(/\b(?:assign|delegate|distribute)\s+(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:ai\s+)?terminals?\s+to\s+(.+)$/i);
  if (countedAssignment) return normalizeInferredTaskGoal(cleanTask(countedAssignment[1]));
  const toMarkers = Array.from(source.matchAll(/\bto\s+/gi));
  const marker = toMarkers.at(-1) || Array.from(source.matchAll(/\bfor\s+/gi))[0];
  return normalizeInferredTaskGoal(cleanTask(
    marker ? source.slice(Number(marker.index) + marker[0].length) : ""
  ));
}

function shouldReusePreviousTaskGoal(text, goal) {
  return /\b(?:still not working|try again|again)\b/i.test(text)
    && /^(?:diagnose|diagnosing|fix|diagnose and fix|diagnosing and fixing)(?:\s+(?:it|this))?$/i.test(goal);
}

function previousTerminalTaskGoal(history) {
  if (!Array.isArray(history)) return "";
  for (const item of history.slice().reverse()) {
    if (item?.role !== "user") continue;
    const goal = terminalTaskGoal(item.text);
    if (goal && !/^(?:diagnose|fix|diagnose and fix)$/i.test(goal)) return goal;
  }
  return "";
}

function terminalSettings(text, context) {
  const fullPc = terminalFullPcScope(text);
  const projectName = terminalProjectName(text);
  return {
    model: terminalModel(text),
    effort: terminalEffort(text),
    permissionMode: FULL_ACCESS.test(text) ? "full" : "standard",
    projectId: fullPc ? "full-pc" : projectName ? "" : String(context.projectId || ""),
    ...(projectName && !fullPc ? { projectName } : {})
  };
}

function terminalCloseAction(text, context) {
  if (
    !TERMINAL_CLOSE_VERBS.test(text)
    || !TERMINAL_NOUN.test(text)
    || !TERMINAL_CLOSE_INTENT.test(text)
    || /\b(?:after|when|once|if|unless)\b/i.test(text)
  ) return null;
  const scope = /\b(?:all|every)\b/i.test(text) ? "all" : "active";
  return { type: "close_terminals", scope, terminalId: scope === "active" ? String(context.terminalId || "") : "" };
}

function terminalPermissionAction(text, context) {
  if (
    !TERMINAL_PERMISSION_VERBS.test(text)
    || !TERMINAL_NOUN.test(text)
    || !FULL_ACCESS.test(text)
    || NEGATED_FULL_ACCESS.test(text)
    || /\bgive\s+(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+of\b/i.test(text)
  ) return null;
  const plural = /\b(?:terminals|termianls|teminals|termnals)\b/i.test(text);
  const scope = plural || /\b(?:all|every|these|those)\b/i.test(text) ? "all" : "active";
  return {
    type: "set_terminal_permissions",
    scope,
    permissionMode: "full",
    terminalId: scope === "active" ? String(context.terminalId || "") : ""
  };
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
  return explicitTerminalCount(text) || 1;
}

function explicitTerminalCount(text) {
  const afterVerb = text.match(/\b(?:open|launch|start|create|spawn|run|assign|delegate|distribute)\s+(?<![\d.])(\d{1,2})(?![\d.])/i);
  if (afterVerb) return clampCount(afterVerb[1]);
  const wordAfterVerb = text.match(/\b(?:open|launch|start|create|spawn|run|assign|delegate|distribute)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i);
  if (wordAfterVerb) return NUMBER_WORDS.get(wordAfterVerb[1].toLowerCase());
  const descriptor = "(?:[a-z0-9][a-z0-9.-]*\\s+){0,3}";
  const numeric = text.match(new RegExp(`(?<![\\d.])\\b(\\d{1,2})\\b(?!\\.\\d)\\s+${descriptor}(?:ai\\s+)?terminals?\\b`, "i"));
  if (numeric) return clampCount(numeric[1]);
  const subagentNumeric = text.match(/(?<![\d.])\b(\d{1,2})\b(?!\.\d)\s+sub-?agents?\b/i);
  if (subagentNumeric) return clampCount(subagentNumeric[1]);
  const word = text.match(new RegExp(`\\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\\s+${descriptor}(?:ai\\s+)?terminals?\\b`, "i"));
  if (word) return NUMBER_WORDS.get(word[1].toLowerCase());
  const subagentWord = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+sub-?agents?\b/i);
  return subagentWord ? NUMBER_WORDS.get(subagentWord[1].toLowerCase()) : null;
}

function explicitTerminalTaskCount(text) {
  const numeric = text.match(/\b(?:assign|delegate|distribute|run|give)\s+(?<![\d.])(\d{1,2})(?![\d.])\s+(?:of\s+)?(?:them|those|these|(?:the\s+)?(?:\d{1,2}\s+)?terminals?|jobs?|tasks?|sub-?agents?)\b/i);
  if (numeric) return clampCount(numeric[1]);
  const word = text.match(/\b(?:assign|delegate|distribute|run|give)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:of\s+)?(?:them|those|these|(?:the\s+)?(?:\d{1,2}\s+)?terminals?|jobs?|tasks?|sub-?agents?)\b/i);
  return word ? NUMBER_WORDS.get(word[1].toLowerCase()) : null;
}

function terminalModel(text) {
  const normalized = text.toLowerCase().replace(/_/g, "-");
  const qualified = normalized.match(/\bopenai\/(gpt-5(?:\.\d+)?(?:-pro)?)\b/);
  if (qualified) return `openai/${qualified[1]}`;
  const version = normalized.match(/\b(?:gpt|codex|open\s*ai|openai|ai)\s*[- ]*\s*(5(?:\.\d+)?)\b/)
    || normalized.match(/\b(5(?:\.\d+)?)\s*(?:gpt|codex)\b/);
  if (version) {
    if (/\bpro\b/.test(normalized)) return `openai/gpt-${version[1]}-pro`;
    if (version[1] === "5" && /\bcodex\b/.test(normalized)) return "gpt-5-codex";
    return `gpt-${version[1]}`;
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

function terminalProjectName(text) {
  const quoted = text.match(/\b(?:on|in|for|with)\s+(?:the\s+|my\s+)?(?:project|projet)(?:\s+(?:named|called))?\s+(["'])([^"']+)\1/i);
  if (quoted) return cleanProjectName(quoted[2]);
  const unquoted = text.match(
    /\b(?:on|in|for|with)\s+(?:the\s+|my\s+)?(?:project|projet)(?:\s+(?:named|called))?\s+([a-z0-9~./\\_-][a-z0-9~./\\_ -]*?)(?=\s+(?:on|in)\s+(?:my|the)\s+(?:desktop|desltpo|dektop|computer|pc)\b|\s+and\s+(?:open|launch|start|create|spawn|run)\b|\s+(?:with|using)\b|[,;.!?]|$)/i
  );
  return cleanProjectName(unquoted?.[1]);
}

function terminalFullPcScope(text) {
  return /\b(?:full pc|whole (?:pc|computer)|entire (?:pc|computer)|home directory)\b/i.test(text);
}

function cleanProjectName(value) { return String(value || "").trim().replace(/\s+/g, " ").slice(0, 120); }

function cleanTask(value) { return String(value || "").trim().replace(/\s+/g, " ").replace(/[.;]+$/, "").slice(0, 500); }

function terminalReply(action) {
  const count = action.count;
  const model = modelLabel(action.model);
  const speed = action.effort === "low" ? " in fast mode" : "";
  const access = action.permissionMode === "full" ? " with full access" : "";
  const project = action.projectName ? ` in project ${action.projectName}` : "";
  return `Opening ${count} ${model} terminal${count === 1 ? "" : "s"}${speed}${access}${project}. You can watch them live in Terminals; Voice and Memory are in the terminal toolbar.`;
}

function terminalTaskReply(action) {
  return action.target === "existing"
    ? "Assigning different tasks across the open terminals."
    : `Assigning ${action.tasks.length} different tasks across ${action.tasks.length} terminals.`;
}

function terminalCloseReply(action) {
  return action.scope === "all" ? "Closing all Vibyra Desktop terminals." : "Closing the active Vibyra Desktop terminal.";
}

function terminalPermissionReply(action) {
  return action.scope === "all"
    ? "Relaunching all open Codex terminals with full permissions."
    : "Relaunching the active Codex terminal with full permissions.";
}

function companionReply(mode) { return `Opening Vibyra ${mode === "voice" ? "Voice" : "Memory"} beside the live terminal workspace.`; }

function modelLabel(model) {
  if (model === "auto") return "AI";
  if (model === "gpt-5-codex") return "Codex";
  return model.split("/").pop().toUpperCase().replace(/-PRO$/, " Pro");
}

function actionResult(action, reply) {
  return {
    ok: true,
    reply,
    title: action.type === "open_terminals" ? "Launch AI terminals"
      : action.type === "run_terminal_tasks" ? "Run terminal tasks"
        : action.type === "close_terminals" ? "Close AI terminals"
          : action.type === "set_terminal_permissions" ? "Update terminal permissions"
          : `Open Vibyra ${action.mode}`,
    actions: [action]
  };
}

function clampCount(value) {
  const count = Number.parseInt(String(value || ""), 10);
  return Math.min(12, Math.max(1, Number.isFinite(count) ? count : 1));
}
