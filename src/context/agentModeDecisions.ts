import type { AgentConnection, ChatMessage } from "../types/domain";
import type { ChatToolMode } from "../types/chatTools";

export function pendingProjectEdit(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.editApproval === "pending" && Boolean(message.pendingApplyId)) ?? null;
}

export function shouldUseBuildChatMode(text: string, skillMode?: string) {
  if (skillMode === "build") return true;
  const prompt = text.trim().toLowerCase();
  if (/^the live preview for .+ crashed while running the existing project\./i.test(prompt)) return false;
  if (/^the runnable preview for .+ crashed\./i.test(prompt) || /\bcaptured preview diagnostics:/i.test(prompt)) return true;
  const buildVerb = "(build|create|make|generate|design|prototype)";
  const target = "\\b(app|tool|page|tracker|dashboard|calculator|game|ui|widget|landing|form|site|website|screen|preview)\\b";
  return (new RegExp(`^(please\\s+|pls\\s+)?${buildVerb}\\b.*${target}`).test(prompt)
    || new RegExp(`^(can|could|would)\\s+(you|u)\\s+${buildVerb}\\b.*${target}`).test(prompt)
    || new RegExp(`^(i\\s+want\\s+you\\s+to|i\\s+need\\s+you\\s+to|need\\s+you\\s+to)\\s+${buildVerb}\\b.*${target}`).test(prompt)
    || /\b(?:fix|repair|debug|resolve)\b[\s\S]{0,80}\b(?:preview|app|site|website|page|html|screen|ui)\b/.test(prompt));
}

export function toolFromSkill(skillId?: string): ChatToolMode | undefined {
  if (skillId === "research" || skillId === "web" || skillId === "analyze") return skillId;
  return undefined;
}

export function shouldUseAdviceContext(text: string, skillMode?: string) {
  if (skillMode === "chat") return true;
  const prompt = text.toLowerCase();
  return /\b(what|why|how|where|when|which|who|review|explain|audit|inspect|look|suggest|advice|recommend|feedback|nicer|better|improve)\b/.test(prompt);
}

export function shouldShowLiveEditActivity(text: string, skillMode: string | undefined, buildMode: boolean) {
  if (buildMode || skillMode === "build") return true;
  const prompt = text.trim().toLowerCase();
  const editVerb = "(add|build|change|create|delete|design|edit|fix|generate|implement|make|modify|refactor|remove|replace|rewrite|update)";
  return new RegExp(`\\b${editVerb}\\b`).test(prompt)
    && /\b(code|component|file|screen|ui|style|css|html|app|page|website|site|function|bug)\b/.test(prompt);
}

export function inferLiveEditFile(selectedPath: string | undefined, text: string) {
  const prompt = text.trim().toLowerCase();
  if (selectedPath && /\b(this|current|selected)\s+file\b|\b(edit|fix|update|change|refactor|rewrite|replace)\b/.test(prompt)) {
    return selectedPath;
  }
  if (/\b(css|styles?|theme|layout|spacing|color|visual|polish)\b/.test(prompt)) return "App.css";
  if (/\b(html|landing|website|site|page)\b/.test(prompt)) return "index.html";
  return "App.js";
}

export function shouldUseDesktopAgentMode(
  text: string,
  skillId: string | undefined,
  skillMode: string | undefined,
  buildMode: boolean,
  connection: AgentConnection | null,
  projectPath: string | undefined
) {
  if (!connection || !projectPath) return false;
  if (/^the runnable preview for .+ crashed\./i.test(text.trim())) return false;
  if (skillId && ["analyze", "explain", "plan", "research", "review", "publish", "ship", "web"].includes(skillId)) return false;
  if (buildMode || skillMode === "build") return true;
  if (skillId && ["debug", "fix", "refactor", "style", "design"].includes(skillId)) return true;

  const prompt = text.trim().toLowerCase();
  const editVerb = "\\b(add|build|change|create|delete|design|edit|fix|generate|implement|make|modify|polish|refactor|remove|repair|replace|rewrite|update)\\b";
  const localTarget = "\\b(app|bug|code|component|css|error|file|function|html|issue|layout|page|preview|screen|site|style|test|ui|website)\\b";
  return new RegExp(editVerb).test(prompt) && new RegExp(localTarget).test(prompt);
}
