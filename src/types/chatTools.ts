export type ChatToolMode = "image" | "research" | "web" | "analyze";

export type ChatStartOptions = {
  tool?: ChatToolMode;
};

export type AgentStartOptions = {
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
