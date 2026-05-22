export type ChatToolMode = "image" | "research" | "web" | "analyze";

export type ChatImageAttachment = {
  id: string;
  dataUrl: string;
  name: string;
  mimeType: string;
  width?: number;
  height?: number;
};

export type ChatFileAttachment = {
  id: string;
  mimeType?: string;
  name: string;
  readStatus?: "loaded" | "unsupported" | "failed";
  size?: number;
  textContent?: string;
  uri?: string;
};

export type ChatStartOptions = {
  displayPrompt?: string;
  fileAttachments?: ChatFileAttachment[];
  imageAttachments?: ChatImageAttachment[];
  model?: string;
  prompt?: string;
  tool?: ChatToolMode;
};

export type ChatToolPlanDraft = {
  title: string;
  steps: string[];
};

export type DeepResearchPlanDraft = ChatToolPlanDraft;

export type AgentStartOptions = {
  displayPrompt?: string;
  fileAttachments?: ChatFileAttachment[];
  imageAttachments?: ChatImageAttachment[];
  model?: string;
  skillId?: string;
};

export type GeneratedImage = {
  id: string;
  title: string;
  url: string;
  provider?: string;
};

export function chatToolSkillId(tool: ChatToolMode) {
  if (tool === "research") return "research";
  if (tool === "web") return "web";
  if (tool === "analyze") return "analyze";
  return "";
}

export const DEEP_RESEARCH_MODEL_KEY = "tool-deep-research";
export const WEB_SEARCH_MODEL_KEY = "tool-web-search";
export const ANALYZE_FILES_MODEL_KEY = "tool-analyze-files";

export function chatToolModelOverride(tool: ChatToolMode | null | undefined) {
  if (tool === "research") return DEEP_RESEARCH_MODEL_KEY;
  if (tool === "web") return WEB_SEARCH_MODEL_KEY;
  if (tool === "analyze") return ANALYZE_FILES_MODEL_KEY;
  return "";
}

const CHAT_TOOL_SLASH_ALIASES: Record<string, ChatToolMode> = {
  analayze: "analyze",
  analyze: "analyze",
  analyse: "analyze",
  anaylze: "analyze",
  anlyze: "analyze",
  deep: "research",
  deepresearch: "research",
  file: "analyze",
  files: "analyze",
  generate: "image",
  image: "image",
  research: "research",
  screenshot: "image",
  search: "web",
  web: "web"
};

export function parseChatToolSlash(text: string): { tool: ChatToolMode; prompt: string } | null {
  const match = text.trim().match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  const tool = CHAT_TOOL_SLASH_ALIASES[match[1].toLowerCase()];
  if (!tool) return null;
  return { tool, prompt: (match[2] ?? "").trim() };
}

export function defaultPromptForChatTool(tool: ChatToolMode | null | undefined) {
  if (tool === "analyze") return "Analyze this project's files and explain the important structure, behavior, and risks.";
  if (tool === "image") return "Generate a polished screenshot-style visual for this project.";
  if (tool === "research") return "Research the topic carefully and summarize source-backed findings, caveats, and practical next steps.";
  if (tool === "web") return "Search the web for current information and summarize the most useful findings with links and caveats.";
  return "";
}

export function chatToolForModelKey(modelKey: string | null | undefined): ChatToolMode | null {
  if (modelKey === DEEP_RESEARCH_MODEL_KEY) return "research";
  if (modelKey === WEB_SEARCH_MODEL_KEY) return "web";
  if (modelKey === ANALYZE_FILES_MODEL_KEY) return "analyze";
  return null;
}
