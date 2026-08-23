import type Ionicons from "@expo/vector-icons/Ionicons";
import type { ChatToolMode } from "../../../types/chatTools";

export type ChatToolIconName = keyof typeof Ionicons.glyphMap;

const COBALT_TOOL_ACCENT = {
  backgroundColor: "rgba(91, 124, 250, 0.18)",
  borderColor: "rgba(196, 181, 253, 0.34)",
  iconColor: "#EDE2FF",
  textColor: "#91A7FF"
};

const COBALT_TOOL_STRONG = {
  accent: "#5B7CFA",
  border: "rgba(91, 124, 250, 0.3)",
  iconBackground: "rgba(91, 124, 250, 0.16)",
  iconColor: "#EDE2FF"
};

export const chatToolLabels: Record<ChatToolMode, string> = {
  image: "Generate Image",
  research: "Deep Research",
  web: "Agent Web Search",
  analyze: "Analyze Files"
};

export const chatToolDescriptions: Record<ChatToolMode, string> = {
  image: "Create a polished visual from a prompt",
  research: "Research carefully before answering",
  web: "Search the web and summarize sources",
  analyze: "Inspect project files and explain findings"
};

export const chatToolPreviewKickers: Record<ChatToolMode, string> = {
  analyze: "File analysis",
  image: "Image brief",
  research: "Deep Research plan",
  web: "Web search plan"
};

export const chatToolLoadingText: Record<ChatToolMode, string> = {
  analyze: "Starting file analysis.",
  image: "Preparing a visual brief before image generation starts.",
  research: "Building a topic-specific plan before research starts.",
  web: "Preparing focused search angles before web search starts."
};

export const chatToolIcons: Record<ChatToolMode, ChatToolIconName> = {
  analyze: "document-text-outline",
  image: "image-outline",
  research: "search-outline",
  web: "globe-outline"
};

export const chatToolAccent: Record<ChatToolMode, {
  backgroundColor: string;
  borderColor: string;
  iconColor: string;
  textColor: string;
}> = {
  analyze: COBALT_TOOL_ACCENT,
  image: COBALT_TOOL_ACCENT,
  research: COBALT_TOOL_ACCENT,
  web: COBALT_TOOL_ACCENT
};

export const chatToolStrongColors: Record<ChatToolMode, {
  accent: string;
  border: string;
  iconBackground: string;
  iconColor: string;
}> = {
  analyze: COBALT_TOOL_STRONG,
  image: COBALT_TOOL_STRONG,
  research: COBALT_TOOL_STRONG,
  web: COBALT_TOOL_STRONG
};
