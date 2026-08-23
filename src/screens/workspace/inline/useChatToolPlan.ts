import { useEffect, useRef, useState } from "react";
import type { ChatStartOptions, ChatToolMode, ChatToolPlanDraft } from "../../../types/chatTools";
import { chatToolModelOverride } from "../../../types/chatTools";
import { createDeepResearchPlan } from "../../../utils/researchPlanApi";
import {
  buildChatToolPlan,
  formatToolPlanForChat,
  type ChatToolPlanPreview,
} from "./ChatToolPlanCard";

type PendingToolPlan = {
  countdown: number | null;
  draft: ChatToolPlanDraft;
  displayPrompt: string;
  options?: ChatStartOptions;
  tool: ChatToolMode;
};

type ToolPlanOptions = {
  authToken?: string | null;
  clearActiveTool: () => void;
  onPreviewChange?: (preview: ChatToolPlanPreview | null) => void;
  onStart: (options?: ChatStartOptions) => void;
  setTaskText: (value: string) => void;
};

export function useChatToolPlan(options: ToolPlanOptions) {
  const [planningTool, setPlanningTool] = useState<ChatToolMode | null>(null);
  const [pendingToolPlan, setPendingToolPlan] = useState<PendingToolPlan | null>(null);
  const planRequestIdRef = useRef(0);
  const startingToolPlanRef = useRef(false);

  useEffect(() => {
    if (!pendingToolPlan || pendingToolPlan.countdown === null) return;
    if (pendingToolPlan.countdown <= 0) {
      startToolPlan();
      return;
    }
    const timer = setTimeout(() => {
      setPendingToolPlan((current) => current && current.countdown !== null
        ? { ...current, countdown: current.countdown - 1 }
        : current);
    }, 1000);
    return () => clearTimeout(timer);
  }, [pendingToolPlan]);

  useEffect(() => {
    options.onPreviewChange?.(planningTool || pendingToolPlan ? {
      countdown: pendingToolPlan?.countdown ?? null,
      loading: Boolean(planningTool),
      onCancel: cancelToolPlan,
      onEdit: editToolPlan,
      onStart: startToolPlan,
      plan: pendingToolPlan?.draft ?? null,
      tool: pendingToolPlan?.tool ?? planningTool ?? "research",
    } : null);
  }, [
    planningTool,
    pendingToolPlan?.countdown,
    pendingToolPlan?.draft,
    pendingToolPlan?.displayPrompt,
    pendingToolPlan?.tool,
  ]);

  useEffect(() => () => {
    planRequestIdRef.current += 1;
    startingToolPlanRef.current = false;
    options.onPreviewChange?.(null);
  }, []);

  async function prepare(
    tool: ChatToolMode,
    prompt: string,
    startOptions?: ChatStartOptions,
  ) {
    const requestId = planRequestIdRef.current + 1;
    planRequestIdRef.current = requestId;
    const draft = await loadToolPlan(tool, prompt, requestId);
    if (planRequestIdRef.current !== requestId) return;
    setPendingToolPlan({
      countdown: tool === "research" ? 60 : null,
      draft,
      displayPrompt: prompt,
      options: toolStartOptions(tool, prompt, draft, startOptions),
      tool,
    });
  }

  async function loadToolPlan(tool: ChatToolMode, prompt: string, requestId: number) {
    if (tool !== "research" || !options.authToken) return buildChatToolPlan(tool, prompt);
    setPlanningTool(tool);
    try {
      return await createDeepResearchPlan(options.authToken, prompt);
    } catch {
      return buildChatToolPlan(tool, prompt);
    } finally {
      if (planRequestIdRef.current === requestId) setPlanningTool(null);
    }
  }

  function cancelToolPlan() {
    invalidate();
    setPendingToolPlan(null);
    setPlanningTool(null);
    options.clearActiveTool();
  }

  function editToolPlan() {
    if (!pendingToolPlan) return;
    invalidate();
    options.setTaskText(pendingToolPlan.displayPrompt);
    setPendingToolPlan(null);
  }

  function startToolPlan() {
    if (!pendingToolPlan || startingToolPlanRef.current) return;
    startingToolPlanRef.current = true;
    planRequestIdRef.current += 1;
    const startOptions = pendingToolPlan.options;
    setPendingToolPlan(null);
    options.onStart(startOptions);
    options.clearActiveTool();
    setTimeout(() => { startingToolPlanRef.current = false; }, 750);
  }

  function clear() {
    invalidate();
    setPendingToolPlan(null);
    setPlanningTool(null);
  }

  function invalidate() {
    planRequestIdRef.current += 1;
    startingToolPlanRef.current = false;
  }

  return {
    clear,
    locked: Boolean(planningTool) || Boolean(pendingToolPlan),
    prepare,
  };
}

function toolStartOptions(
  tool: ChatToolMode,
  displayPrompt: string,
  draft: ChatToolPlanDraft,
  options?: ChatStartOptions,
): ChatStartOptions {
  const model = chatToolModelOverride(tool);
  const prompt = tool === "image"
    ? displayPrompt
    : formatToolPlanForChat(displayPrompt, tool, draft);
  return { ...options, displayPrompt, ...(model ? { model } : {}), prompt, tool };
}
