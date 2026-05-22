import type { Ionicons } from "@expo/vector-icons";
import type { ChatToolMode } from "../../../types/chatTools";

export type ChatToolIconName = keyof typeof Ionicons.glyphMap;

const PURPLE_TOOL_ACCENT = {
  backgroundColor: "rgba(124, 58, 237, 0.18)",
  borderColor: "rgba(196, 181, 253, 0.34)",
  iconColor: "#EDE2FF",
  textColor: "#EFE7FF"
};

const PURPLE_TOOL_STRONG = {
  accent: "#A855F7",
  border: "rgba(168, 85, 247, 0.3)",
  iconBackground: "rgba(124, 58, 237, 0.16)",
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
  analyze: PURPLE_TOOL_ACCENT,
  image: PURPLE_TOOL_ACCENT,
  research: PURPLE_TOOL_ACCENT,
  web: PURPLE_TOOL_ACCENT
};

export const chatToolStrongColors: Record<ChatToolMode, {
  accent: string;
  border: string;
  iconBackground: string;
  iconColor: string;
}> = {
  analyze: PURPLE_TOOL_STRONG,
  image: PURPLE_TOOL_STRONG,
  research: PURPLE_TOOL_STRONG,
  web: PURPLE_TOOL_STRONG
};
