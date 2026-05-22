import React from "react";
import type { ChatToolPlanDraft } from "../../../types/chatTools";
import { ChatToolPlanCard, buildChatToolPlan, formatToolPlanForChat, type ChatToolPlanPreview } from "./ChatToolPlanCard";

export type DeepResearchPlanPreview = Omit<ChatToolPlanPreview, "tool">;

export function buildDeepResearchPlan(prompt: string): ChatToolPlanDraft {
  return buildChatToolPlan("research", prompt);
}

export function formatDeepResearchPlanForChat(prompt: string, plan: ChatToolPlanDraft) {
  return formatToolPlanForChat(prompt, "research", plan);
}

export function DeepResearchPlanCard(props: DeepResearchPlanPreview) {
  return <ChatToolPlanCard {...props} tool="research" />;
}
