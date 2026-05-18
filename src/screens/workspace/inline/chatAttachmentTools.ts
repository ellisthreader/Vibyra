import type { ChatToolMode } from "../../../types/chatTools";

export const chatToolLabels: Record<ChatToolMode, string> = {
  image: "Create image",
  research: "Deep research",
  web: "Agent web search",
  analyze: "Analyze files"
};

export const chatToolDescriptions: Record<ChatToolMode, string> = {
  image: "Generate a visual asset",
  research: "Research carefully before answering",
  web: "Search the web and summarize sources",
  analyze: "Inspect project files and explain findings"
};
