import { useMemo, useState } from "react";
import { Keyboard } from "react-native";
import type { ChatFileAttachment, ChatImageAttachment, ChatStartOptions, ChatToolMode } from "../../../types/chatTools";
import { chatToolForModelKey, chatToolModelOverride, defaultPromptForChatTool, parseChatToolSlash } from "../../../types/chatTools";
import { useAppContext } from "../../../context/AppContext";
import { usePreferences, useThemedColor } from "../../../context/PreferencesContext";
import { chatCommandHelpReply, filterChatCommands, matchChatCommand, type ChatCommand } from "../data/chatCommands";
import { chatModelOptionFor, chatModelOptions } from "../data/chatModels";
import { mergeChatSkills } from "../../../utils/chatSkills";
import { getUnlockedInitialChatModel, isModelLockedForPlan } from "./ChatModelControls";
import { chatToolAccent } from "./chatAttachmentTools";
import type { ChatComposerProps } from "./ChatComposerTypes";
import { useChatToolPlan } from "./useChatToolPlan";

export function useChatComposerController(props: ChatComposerProps) {
  const [attachmentSheetOpen, setAttachmentSheetOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<ChatToolMode | null>(null);
  const [modelBeforeTool, setModelBeforeTool] = useState<string | null>(null);
  const [imageAttachments, setImageAttachments] = useState<ChatImageAttachment[]>([]);
  const [fileAttachments, setFileAttachments] = useState<ChatFileAttachment[]>([]);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [billingSheetOpen, setBillingSheetOpen] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const appCtx = useAppContext();
  const prefs = usePreferences();
  const placeholderColor = useThemedColor("#747C8A");
  const toolIconColor = useThemedColor("#A6ADBA");
  const slashToolMatch = parseChatToolSlash(props.taskText);
  const slashTool = slashToolMatch?.tool;
  const activeToolModel = chatToolModelOverride(activeTool) || (slashTool ? chatToolModelOverride(slashTool) : "");
  const selectedChatModel = activeToolModel
    || getUnlockedInitialChatModel(props.selectedModel, props.accountPlan, props.selectedChatModel);
  const currentModel = chatModelOptionFor(selectedChatModel) ?? chatModelOptions[0];
  const inlineTool = activeTool ?? slashTool ?? chatToolForModelKey(currentModel.key);
  const inlineToolAccent = inlineTool ? chatToolAccent[inlineTool] : null;
  const slashMatch = props.taskText.match(/^\/(\w*)$/);
  const slashQuery = slashMatch?.[1] ?? "";
  const filteredSkills = useMemo(() => {
    const skills = mergeChatSkills(props.chatSkills);
    if (!slashMatch) return [];
    const query = slashQuery.toLowerCase();
    return query ? skills.filter((skill) =>
      skill.id.toLowerCase().includes(query)
      || skill.label.toLowerCase().includes(query)
      || skill.slash.toLowerCase().includes(`/${query}`)) : skills;
  }, [props.chatSkills, slashMatch, slashQuery]);
  const filteredCommands = useMemo(
    () => slashMatch ? filterChatCommands(slashQuery) : [],
    [slashMatch, slashQuery],
  );
  const toolPlan = useChatToolPlan({
    authToken: appCtx.authToken,
    clearActiveTool,
    onPreviewChange: props.onToolPreviewChange,
    onStart: submitStart,
    setTaskText: props.setTaskText,
  });
  const sendLocked = props.agentRequesting || toolPlan.locked;
  const sendGradient = sendLocked
    ? (prefs.effectiveScheme === "light" ? ["#DADDE8", "#C9CEDA"] as const : ["#282B34", "#1A1C25"] as const)
    : (prefs.effectiveScheme === "light" ? ["#315BD8", "#2449B8", "#315BD8"] as const : ["#4667E8", "#3D5ACF"] as const);

  function selectModel(model: (typeof chatModelOptions)[number]) {
    if (isModelLockedForPlan(model, props.accountPlan)) return;
    const activeOverride = chatToolModelOverride(activeTool);
    if (activeOverride && model.key !== activeOverride) setActiveTool(null);
    setModelBeforeTool(null);
    props.setSelectedChatModel(model.key);
    if (model.modelKey) props.setSelectedModel(model.modelKey);
    setModelMenuOpen(false);
  }

  function runCommand(command: ChatCommand, args: string) {
    const userText = args ? `${command.slash} ${args}` : command.slash;
    if (command.kind === "open") {
      if (args.trim()) {
        props.setTaskText("");
        props.onStart({ displayPrompt: userText, prompt: `open folder ${args.trim()}` });
        return;
      }
      props.onOpenFolderCommand();
      return;
    }
    props.setTaskText("");
    if (command.kind === "help") appCtx.addLocalChatReply(userText, chatCommandHelpReply);
    if (command.kind === "clear") appCtx.clearCurrentChat();
    if (command.kind === "new") props.onNewChat();
    if (command.kind === "test") props.onTestPreviewCommand(userText);
  }

  async function handleStart() {
    if (toolPlan.locked) return;
    const parsed = matchChatCommand(props.taskText);
    if (parsed) {
      runCommand(parsed.command, parsed.args);
      resetAfterStart();
      return;
    }
    const startTool = activeTool ?? slashTool;
    const cleanedSlashPrompt = slashToolMatch?.prompt ?? "";
    const typedPrompt = slashToolMatch ? cleanedSlashPrompt : props.taskText.trim();
    const fallbackPrompt = attachmentFallback(typedPrompt, imageAttachments, fileAttachments, startTool);
    if (!typedPrompt && !fallbackPrompt) return;
    const promptOverride = fallbackPrompt ?? (slashToolMatch ? cleanedSlashPrompt : undefined);
    const startOptions = buildStartOptions(startTool, promptOverride);
    if (startTool === "analyze") return submitStart(startOptions);
    if (startTool) {
      await toolPlan.prepare(startTool, promptOverride ?? props.taskText.trim(), startOptions);
      setModelMenuOpen(false);
      return;
    }
    submitStart(startOptions);
  }

  function buildStartOptions(tool?: ChatToolMode, prompt?: string): ChatStartOptions | undefined {
    const model = chatToolModelOverride(tool);
    const hasAttachments = imageAttachments.length > 0 || fileAttachments.length > 0;
    if (!tool && !model && !hasAttachments && !prompt) return undefined;
    return {
      ...(prompt ? { prompt } : {}),
      ...(tool ? { tool } : {}),
      ...(model ? { model } : {}),
      ...(fileAttachments.length ? { fileAttachments } : {}),
      ...(imageAttachments.length ? { imageAttachments } : {}),
    };
  }

  function submitStart(options?: ChatStartOptions) {
    props.onStart(options);
    resetAfterStart();
  }

  function resetAfterStart() {
    clearActiveTool();
    setImageAttachments([]);
    setFileAttachments([]);
  }

  function clearActiveTool() {
    if (chatToolModelOverride(activeTool) && modelBeforeTool) props.setSelectedChatModel(modelBeforeTool);
    setActiveTool(null);
    setModelBeforeTool(null);
  }

  function clearInlineTool() {
    toolPlan.clear();
    if (slashToolMatch) props.setTaskText(slashToolMatch.prompt);
    clearActiveTool();
  }

  return {
    attachmentSheetOpen, billingSheetOpen, composerFocused, currentModel,
    fileAttachments, filteredCommands, filteredSkills, handleStart, imageAttachments,
    inlineTool, inlineToolAccent, modelMenuOpen, openAttachmentSheet: () => {
      Keyboard.dismiss(); setModelMenuOpen(false); setAttachmentSheetOpen(true);
    },
    placeholderColor, runCommand, selectModel, selectedChatModel, sendGradient,
    sendLocked, setAttachmentSheetOpen, setBillingSheetOpen, setComposerFocused,
    setFileAttachments, setImageAttachments, setModelMenuOpen, toolIconColor,
    slashMenuOpen: Boolean(slashMatch) && Boolean(filteredCommands.length || filteredSkills.length),
    clearInlineTool,
    selectAttachmentPrompt: (prompt: string) => {
      const current = props.taskText.trim();
      props.setTaskText(current ? `${current}\n${prompt}` : prompt);
      setAttachmentSheetOpen(false);
    },
    selectAttachmentTool: (tool: ChatToolMode) => {
      const model = chatToolModelOverride(tool);
      if (model) {
        setModelBeforeTool((current) => current ?? props.selectedChatModel);
        props.setSelectedChatModel(model);
      } else if (chatToolModelOverride(activeTool) && modelBeforeTool) {
        props.setSelectedChatModel(modelBeforeTool); setModelBeforeTool(null);
      }
      setActiveTool(tool); setAttachmentSheetOpen(false);
    },
  };
}

function attachmentFallback(
  prompt: string,
  images: ChatImageAttachment[],
  files: ChatFileAttachment[],
  tool?: ChatToolMode,
) {
  if (prompt) return undefined;
  if (images.length) return "Describe this image and explain what matters for my request.";
  if (files.length) return "Use the attached file with my request.";
  return defaultPromptForChatTool(tool) || undefined;
}
