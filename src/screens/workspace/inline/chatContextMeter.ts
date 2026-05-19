import type { ChatMessage, FileEntry, Project, ProjectBrief, ProjectMemory } from "../../../types/domain";
import type { ChatSkill } from "../../../utils/appApi";
import { isRunArtifact, normalizeAgentReply } from "../../../utils/files";
import { applyLocalSkillPrompt, mergeChatSkills } from "../../../utils/chatSkills";
import { withProjectBriefPrompt } from "../../../utils/projectBriefs";
import { memoryEntriesForPrompt, withProjectMemoryPrompt } from "../../../utils/projectMemory";
import { shouldAttachFileContext } from "../../../context/agentContextPayload";

const CONTEXT_BUDGET_TOKENS = 64000;

type EstimateInput = {
  chatMessages: ChatMessage[];
  chatSkills: ChatSkill[];
  connectionActive: boolean;
  files: FileEntry[];
  project: Project;
  projectBrief?: ProjectBrief;
  projectMemory?: ProjectMemory;
  selectedFile?: FileEntry | null;
  taskText: string;
};

export function estimateChatContextUsage(input: EstimateInput) {
  const task = input.taskText.trim();
  const usableHistory = chatHistory(input.chatMessages, 3, 600);
  const userMemory = memoryEntriesForPrompt(input.projectMemory);
  if (!task && usableHistory.length === 0 && userMemory.length === 0) {
    return emptyUsage();
  }
  const skill = activeSkill(task, input.chatSkills);
  const userText = skill?.fromSlash ? skill.userText : task;
  const intentText = skill?.skill ? userText : task;
  const buildMode = shouldUseBuildChatMode(intentText, skill?.skill.mode);
  const desktopMode = shouldUseDesktopAgentMode(intentText, skill?.skill.id, skill?.skill.mode, buildMode, input.connectionActive, input.project.path);
  const fileContext = shouldAttachFileContext(intentText, input.selectedFile ?? null);
  const richContextMode = buildMode || shouldUseAdviceContext(intentText, skill?.skill.mode);
  const promptBody = skill?.skill && skill.fromSlash
    ? ("promptPrefix" in skill.skill ? applyLocalSkillPrompt(skill.skill, userText) : (userText || skill.skill.label))
    : task;
  const scopedPrompt = fileContext && !desktopMode && !buildMode && input.selectedFile
    ? `In ${input.selectedFile.path}: ${promptBody}`
    : promptBody;
  const prompt = withProjectMemoryPrompt(input.projectMemory, withProjectBriefPrompt(input.projectBrief, scopedPrompt));
  const historyWindow = desktopMode ? 6 : buildMode ? 4 : 3;
  const historyCap = desktopMode ? 1600 : buildMode ? 1200 : 600;
  const history = chatHistory(input.chatMessages, historyWindow, historyCap);
  const fileBody = input.selectedFile && fileContext && (desktopMode || (richContextMode && !buildMode))
    ? `${input.selectedFile.path}\n${(input.selectedFile.body || "").slice(0, desktopMode ? 12000 : 1200)}`
    : "";
  const projectFiles = projectFilesContext(input.files, intentText);
  const parts = [
    prompt,
    input.project.name ? `Project: ${input.project.name}` : "",
    ...history,
    fileBody,
    projectFiles
  ].filter(Boolean);
  const used = Math.min(CONTEXT_BUDGET_TOKENS, Math.ceil(parts.join("\n\n").length / 3.5));
  return { budget: CONTEXT_BUDGET_TOKENS, ratio: Math.max(0, Math.min(1, used / CONTEXT_BUDGET_TOKENS)), used };
}

function emptyUsage() {
  return { budget: CONTEXT_BUDGET_TOKENS, ratio: 0, used: 0 };
}

function chatHistory(messages: ChatMessage[], historyWindow: number, historyCap: number) {
  return messages
    .filter((message) => message.id !== "welcome" && message.text.trim() && message.text !== "Working on it...")
    .slice(-historyWindow)
    .map((message) => `${message.role}: ${message.role === "assistant" ? normalizeAgentReply(message.text) : message.text}`.slice(0, historyCap));
}

function activeSkill(task: string, chatSkills: ChatSkill[]) {
  const match = task.match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  const skill = mergeChatSkills(chatSkills).find((item) => item.id === match[1].toLowerCase());
  return skill ? { fromSlash: true, skill, userText: (match[2] ?? "").trim() } : null;
}

function projectFilesContext(files: FileEntry[], prompt: string) {
  const base = files
    .filter((file) => file.id !== "empty" && file.path && !isRunArtifact(file))
    .slice(0, 300)
    .map((file) => ({
      language: file.language || "",
      loaded: Boolean(file.body?.trim()),
      path: file.path,
      snippet: ""
    }));
  if (wantsStyleContext(prompt)) {
    const stylePaths = new Set(base.filter((item) => isStyleContextPath(item.path, item.language)).slice(0, 8).map((item) => item.path));
    for (const item of base) {
      if (!stylePaths.has(item.path)) continue;
      const file = files.find((candidate) => candidate.path === item.path);
      item.snippet = styleExcerpt(file?.body ?? "");
    }
  }
  const lines = base.flatMap((item) => {
    const meta = `${item.language}${item.loaded ? " loaded" : ""}`.trim();
    const header = `- ${item.path.slice(0, 180)}${meta ? ` (${meta})` : ""}`;
    return item.snippet ? [header, ...item.snippet.split("\n").map((line) => `  ${line.trim()}`).filter((line) => line.trim())] : [header];
  });
  return lines.join("\n").slice(0, 20000);
}

function shouldUseBuildChatMode(text: string, skillMode?: string) {
  if (skillMode === "build") return true;
  const prompt = text.trim().toLowerCase();
  if (/^the live preview for .+ crashed while running the existing project\./i.test(prompt)) return false;
  if (/^the runnable preview for .+ crashed\./i.test(prompt) || /\bcaptured preview diagnostics:/i.test(prompt)) return true;
  const buildVerb = "(build|create|make|generate|design|prototype)";
  const target = "\\b(app|tool|page|tracker|dashboard|calculator|game|ui|widget|landing|form|site|website|screen|preview)\\b";
  return new RegExp(`^(please\\s+|pls\\s+)?${buildVerb}\\b.*${target}`).test(prompt)
    || new RegExp(`^(can|could|would)\\s+(you|u)\\s+${buildVerb}\\b.*${target}`).test(prompt)
    || new RegExp(`^(i\\s+want\\s+you\\s+to|i\\s+need\\s+you\\s+to|need\\s+you\\s+to)\\s+${buildVerb}\\b.*${target}`).test(prompt)
    || /\b(?:fix|repair|debug|resolve)\b[\s\S]{0,80}\b(?:preview|app|site|website|page|html|screen|ui)\b/.test(prompt);
}

function shouldUseAdviceContext(text: string, skillMode?: string) {
  return skillMode === "chat" || /\b(what|why|how|where|when|which|who|review|explain|audit|inspect|look|suggest|advice|recommend|feedback|nicer|better|improve)\b/i.test(text);
}

function shouldUseDesktopAgentMode(text: string, skillId: string | undefined, skillMode: string | undefined, buildMode: boolean, connectionActive: boolean, projectPath?: string) {
  if (!connectionActive || !projectPath) return false;
  if (/^the runnable preview for .+ crashed\./i.test(text.trim())) return false;
  if (skillId && ["analyze", "explain", "plan", "research", "review", "publish", "ship", "web"].includes(skillId)) return false;
  if (buildMode || skillMode === "build") return true;
  if (skillId && ["debug", "fix", "refactor", "style", "design"].includes(skillId)) return true;
  const prompt = text.trim().toLowerCase();
  return /\b(add|build|change|create|delete|design|edit|fix|generate|implement|make|modify|polish|refactor|remove|repair|replace|rewrite|update)\b/.test(prompt)
    && /\b(app|bug|code|component|css|error|file|function|html|issue|layout|page|preview|screen|site|style|test|ui|website)\b/.test(prompt);
}

function wantsStyleContext(prompt: string) {
  return /\b(colou?r|palette|scheme|theme|brand|branding|visual identity|styling|design system)\b/i.test(prompt);
}

function isStyleContextPath(path: string, language: string) {
  const value = `${path} ${language}`.toLowerCase();
  return /\.(css|scss|sass|less|tsx?|jsx?)$/.test(path.toLowerCase())
    && /\b(style|styles|theme|themes|color|colors|colour|colours|palette|token|tokens|tailwind|component|screen|page|app)\b/.test(value);
}

function styleExcerpt(body: string) {
  const lines = body.split(/\r\n|\r|\n/);
  const matches = lines
    .map((line, index) => ({ index: index + 1, line: line.trim() }))
    .filter(({ line }) => /#(?:[0-9a-f]{3,8})\b|rgba?\(|hsla?\(|\b(color|background|border|shadow|theme|palette|primary|secondary|accent|surface|text|muted|brand)\b|var\(/i.test(line))
    .slice(0, 24)
    .map(({ index, line }) => `${index}: ${line}`);
  return (matches.length > 0 ? matches.join("\n") : lines.slice(0, 20).join("\n")).slice(0, 1200);
}
