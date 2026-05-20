export type ChatToolMode = "image" | "research" | "web" | "analyze";

export type ChatImageAttachment = {
  id: string;
  dataUrl: string;
  name: string;
  mimeType: string;
  width?: number;
  height?: number;
};

export type ChatStartOptions = {
  imageAttachments?: ChatImageAttachment[];
  model?: string;
  prompt?: string;
  tool?: ChatToolMode;
};

export type AgentStartOptions = {
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
