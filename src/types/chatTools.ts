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
  prompt?: string;
  tool?: ChatToolMode;
};

export type AgentStartOptions = {
  imageAttachments?: ChatImageAttachment[];
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
