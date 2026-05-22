import React, { useEffect, useMemo, useState } from "react";
import { Keyboard, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ChatSkill } from "../../../utils/appApi";
import { colors } from "../../../styles/theme";
import type { ChatFileAttachment, ChatImageAttachment, ChatStartOptions, ChatToolMode, ChatToolPlanDraft } from "../../../types/chatTools";
import { chatToolForModelKey, chatToolModelOverride, defaultPromptForChatTool, parseChatToolSlash } from "../../../types/chatTools";
import { ChatMessage, ModelKey, ReasoningEffort } from "../../../types/domain";
import { useAppContext } from "../../../context/AppContext";
import { usePreferences, useThemedColor } from "../../../context/PreferencesContext";
import { ChatCommand, chatCommandHelpReply, filterChatCommands, matchChatCommand } from "../data/chatCommands";
import { chatModelOptionFor, chatModelOptions } from "../data/chatModels";
import { mergeChatSkills } from "../../../utils/chatSkills";
import { styles } from "../styles";
import { LowCreditsWarning, getUnlockedInitialChatModel, isModelLockedForPlan } from "./chunk10";
import { ModelMenu, effortShortLabel } from "./ChatComposerMenus";
import { ChatAttachmentSheet } from "./ChatAttachmentSheet";
import { chatToolAccent, chatToolIcons, chatToolLabels } from "./chatAttachmentTools";
import { ChatImageAttachmentPills } from "./ChatImageAttachmentPills";
import { ChatUsageLimitNotice } from "./ChatUsageLimitNotice";
import { BillingSheet } from "./profile/BillingSheet";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { ProjectMemoryBar } from "./ProjectMemoryBar";
import { PcPermissionControl } from "./PcPermissionControl";
import { createDeepResearchPlan } from "../../../utils/researchPlanApi";
import { buildChatToolPlan, formatToolPlanForChat, type ChatToolPlanPreview } from "./ChatToolPlanCard";

type ChatComposerProps = {
  accountPlan: string;
  agentRequesting: boolean;
  bottomInset: number;
  chatMessages: ChatMessage[];
  chatSkills: ChatSkill[];
  creditPercentRemaining: number;
  creditsLow: boolean;
  onNewChat: () => void;
  onOpenPcConnection: () => void;
  projectId?: string;
  onOpenFolderCommand: () => void;
  onTestPreviewCommand: (userText: string) => void;
  onOpenTokens: () => void;
  onToolPreviewChange?: (preview: ChatToolPlanPreview | null) => void;
  onStart: (options?: ChatStartOptions) => void;
  reasoningEffort: ReasoningEffort;
  selectedChatModel: string;
  selectedModel: ModelKey;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  setSelectedChatModel: (model: string) => void;
  setSelectedModel: (model: ModelKey) => void;
  setTaskText: (value: string) => void;
  taskText: string;
};

export function ChatComposer(props: ChatComposerProps) {
  type PendingToolPlan = {
    countdown: number | null;
    draft: ChatToolPlanDraft;
    displayPrompt: string;
    options?: ChatStartOptions;
    tool: ChatToolMode;
  };
  const [attachmentSheetOpen, setAttachmentSheetOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<ChatToolMode | null>(null);
  const [modelBeforeTool, setModelBeforeTool] = useState<string | null>(null);
  const [imageAttachments, setImageAttachments] = useState<ChatImageAttachment[]>([]);
  const [fileAttachments, setFileAttachments] = useState<ChatFileAttachment[]>([]);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [billingSheetOpen, setBillingSheetOpen] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [planningTool, setPlanningTool] = useState<ChatToolMode | null>(null);
  const [pendingToolPlan, setPendingToolPlan] = useState<PendingToolPlan | null>(null);
  const appCtx = useAppContext();
  const prefs = usePreferences();
  const placeholderColor = useThemedColor("#8F8A9E");
  const toolIconColor = useThemedColor("#B9B5C8");
  const slashToolMatch = parseChatToolSlash(props.taskText);
  const slashTool = slashToolMatch?.tool;
  const slashModelOverride = slashTool ? chatToolModelOverride(slashTool) : "";
  const activeToolModel = chatToolModelOverride(activeTool) || slashModelOverride;
  const selectedChatModel = activeToolModel || getUnlockedInitialChatModel(props.selectedModel, props.accountPlan, props.selectedChatModel);
  const currentModel = chatModelOptionFor(selectedChatModel) ?? chatModelOptions[0];
  const inlineTool = activeTool ?? slashTool ?? chatToolForModelKey(currentModel.key);
  const inlineToolAccent = inlineTool ? chatToolAccent[inlineTool] : null;
  const sendLocked = props.agentRequesting || Boolean(planningTool);
  const sendGradient = sendLocked
    ? (prefs.effectiveScheme === "light" ? ["#DADDE8", "#C9CEDA"] as const : ["#282B34", "#1A1C25"] as const)
    : (prefs.effectiveScheme === "light" ? ["#7C3AED", "#6D3BFF", "#4F46E5"] as const : ["#A368FF", "#5D24D8"] as const);
  const slashMatch = props.taskText.match(/^\/(\w*)$/);
  const slashQuery = slashMatch?.[1] ?? "";
  const filteredSkills = useMemo(() => {
    const skills = mergeChatSkills(props.chatSkills);
    if (!slashMatch) return [] as ChatSkill[];
    const query = slashQuery.toLowerCase();
    if (!query) return skills;
    return skills.filter((skill) =>
      skill.id.toLowerCase().includes(query)
      || skill.label.toLowerCase().includes(query)
      || skill.slash.toLowerCase().includes(`/${query}`)
    );
  }, [props.chatSkills, slashMatch, slashQuery]);
  const filteredCommands = useMemo(() => slashMatch ? filterChatCommands(slashQuery) : [] as ChatCommand[], [slashMatch, slashQuery]);
  const slashMenuOpen = Boolean(slashMatch) && (filteredCommands.length > 0 || filteredSkills.length > 0);

  useEffect(() => {
    if (!pendingToolPlan || pendingToolPlan.countdown === null) return;
    if (pendingToolPlan.countdown <= 0) {
      startToolPlan();
      return;
    }
    const timer = setTimeout(() => {
      setPendingToolPlan((current) => current && current.countdown !== null ? { ...current, countdown: current.countdown - 1 } : current);
    }, 1000);
    return () => clearTimeout(timer);
  }, [pendingToolPlan]);

  useEffect(() => {
    props.onToolPreviewChange?.(
      planningTool || pendingToolPlan
        ? {
          countdown: pendingToolPlan?.countdown ?? null,
          loading: Boolean(planningTool),
          onCancel: cancelToolPlan,
          onEdit: editToolPlan,
          onStart: startToolPlan,
          plan: pendingToolPlan?.draft ?? null,
          tool: pendingToolPlan?.tool ?? planningTool ?? "research"
        }
        : null
    );
  }, [planningTool, pendingToolPlan?.countdown, pendingToolPlan?.draft, pendingToolPlan?.displayPrompt, pendingToolPlan?.tool]);

  useEffect(() => () => props.onToolPreviewChange?.(null), []);

  function selectModel(model: (typeof chatModelOptions)[number]) {
    if (isModelLockedForPlan(model, props.accountPlan)) return;
    const activeToolOverride = chatToolModelOverride(activeTool);
    if (activeToolOverride && model.key !== activeToolOverride) setActiveTool(null);
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
    if (planningTool) return;
    const parsed = matchChatCommand(props.taskText);
    if (parsed) {
      runCommand(parsed.command, parsed.args);
      clearActiveTool();
      setImageAttachments([]);
      setFileAttachments([]);
      return;
    }
    const startTool = activeTool ?? slashTool;
    const cleanedSlashPrompt = slashToolMatch ? slashToolMatch.prompt : "";
    const typedPrompt = slashToolMatch ? cleanedSlashPrompt : props.taskText.trim();
    const hasVisibleAttachments = imageAttachments.length > 0 || fileAttachments.length > 0;
    const fallbackPrompt = !typedPrompt && imageAttachments.length > 0
      ? "Describe this image and explain what matters for my request."
      : !typedPrompt && fileAttachments.length > 0
        ? "Use the attached file with my request."
      : !typedPrompt
        ? defaultPromptForChatTool(startTool) || undefined
        : undefined;
    const promptOverride = fallbackPrompt ?? (slashToolMatch ? cleanedSlashPrompt : undefined);
    if (!typedPrompt && !fallbackPrompt) return;
    const modelOverride = chatToolModelOverride(startTool);
    const startOptions = startTool || modelOverride || hasVisibleAttachments || promptOverride ? {
      ...(promptOverride ? { prompt: promptOverride } : {}),
      ...(startTool ? { tool: startTool } : {}),
      ...(modelOverride ? { model: modelOverride } : {}),
      ...(fileAttachments.length > 0 ? { fileAttachments } : {}),
      ...(imageAttachments.length > 0 ? { imageAttachments } : {})
    } : undefined;
    if (startTool === "analyze") {
      submitStart(startOptions);
      return;
    }
    if (startTool) {
      const prompt = promptOverride ?? props.taskText.trim();
      const draft = await loadToolPlan(startTool, prompt);
      setPendingToolPlan({
        countdown: startTool === "research" ? 60 : null,
        draft,
        displayPrompt: prompt,
        options: toolStartOptions(startTool, prompt, draft, startOptions),
        tool: startTool
      });
      setModelMenuOpen(false);
      return;
    }
    submitStart(startOptions);
  }

  async function loadToolPlan(tool: ChatToolMode, prompt: string): Promise<ChatToolPlanDraft> {
    if (tool !== "research" || !appCtx.authToken) return buildChatToolPlan(tool, prompt);
    setPlanningTool(tool);
    try {
      return await createDeepResearchPlan(appCtx.authToken, prompt);
    } catch {
      return buildChatToolPlan(tool, prompt);
    } finally {
      setPlanningTool(null);
    }
  }

  function submitStart(options?: ChatStartOptions) {
    props.onStart(options);
    clearActiveTool();
    setImageAttachments([]);
    setFileAttachments([]);
  }

  function cancelToolPlan() {
    setPendingToolPlan(null);
    setPlanningTool(null);
    clearActiveTool();
  }

  function editToolPlan() {
    if (!pendingToolPlan) return;
    props.setTaskText(pendingToolPlan.displayPrompt);
    setPendingToolPlan(null);
  }

  function startToolPlan() {
    if (!pendingToolPlan) return;
    const options = pendingToolPlan.options;
    setPendingToolPlan(null);
    submitStart(options);
  }

  function toolStartOptions(tool: ChatToolMode, displayPrompt: string, draft: ChatToolPlanDraft, options?: ChatStartOptions): ChatStartOptions {
    const model = chatToolModelOverride(tool);
    const prompt = tool === "image" ? displayPrompt : formatToolPlanForChat(displayPrompt, tool, draft);
    return {
      ...options,
      displayPrompt,
      ...(model ? { model } : {}),
      prompt,
      tool
    };
  }

  function openAttachmentSheet() {
    Keyboard.dismiss();
    setModelMenuOpen(false);
    setAttachmentSheetOpen(true);
  }

  function selectAttachmentPrompt(prompt: string) {
    const current = props.taskText.trim();
    props.setTaskText(current ? `${current}\n${prompt}` : prompt);
    setAttachmentSheetOpen(false);
  }

  function clearActiveTool() {
    if (chatToolModelOverride(activeTool) && modelBeforeTool) props.setSelectedChatModel(modelBeforeTool);
    setActiveTool(null);
    setModelBeforeTool(null);
  }

  function clearInlineTool() {
    if (slashToolMatch) props.setTaskText(slashToolMatch.prompt);
    setPendingToolPlan(null);
    setPlanningTool(null);
    clearActiveTool();
  }

  function selectAttachmentTool(tool: ChatToolMode) {
    const toolModel = chatToolModelOverride(tool);
    if (toolModel) {
      setModelBeforeTool((current) => current ?? props.selectedChatModel);
      props.setSelectedChatModel(toolModel);
    } else if (chatToolModelOverride(activeTool) && modelBeforeTool) {
      props.setSelectedChatModel(modelBeforeTool);
      setModelBeforeTool(null);
    }
    setActiveTool(tool);
    setAttachmentSheetOpen(false);
  }

  function selectImageAttachment(attachment: ChatImageAttachment) {
    setImageAttachments((current) => [...current, attachment].slice(-3));
    setAttachmentSheetOpen(false);
  }

  function selectFileAttachment(attachment: ChatFileAttachment) {
    setFileAttachments((current) => [...current, attachment].slice(-3));
    setAttachmentSheetOpen(false);
  }

  return (
    <View style={[styles.chatComposerShell, { paddingBottom: Math.max(props.bottomInset, 8) }]}>
      <ChatUsageLimitNotice messages={props.chatMessages} />
      {props.creditsLow ? <LowCreditsWarning onOpenTokens={props.onOpenTokens} percentRemaining={props.creditPercentRemaining} /> : null}
      {slashMenuOpen ? <SlashCommandMenu commands={filteredCommands} skills={filteredSkills} onSelectCommand={(command) => runCommand(command, "")} onSelectSkill={(skill) => props.setTaskText(`${skill.slash} `)} /> : null}
      <ModelMenu
        open={modelMenuOpen}
        accountPlan={props.accountPlan}
        selected={selectedChatModel}
        reasoningEffort={props.reasoningEffort}
        onSelect={selectModel}
        onSelectEffort={props.setReasoningEffort}
        onUpgrade={() => { setModelMenuOpen(false); setBillingSheetOpen(true); }}
      />
      <View style={[styles.chatComposer, composerFocused && styles.chatComposerFocused]}>
        <ChatImageAttachmentPills
          fileAttachments={fileAttachments}
          imageAttachments={imageAttachments}
          onRemoveFile={(id) => setFileAttachments((current) => current.filter((item) => item.id !== id))}
          onRemoveImage={(id) => setImageAttachments((current) => current.filter((item) => item.id !== id))}
        />
        <TextInput
          value={props.taskText}
          onChangeText={props.setTaskText}
          placeholder="Type a note, or use / to activate Vibyra..."
          placeholderTextColor={placeholderColor}
          multiline
          onFocus={() => setComposerFocused(true)}
          onBlur={() => setComposerFocused(false)}
          style={styles.chatComposerInput}
        />
        <View style={styles.chatComposerBottom}>
          <View style={styles.chatComposerTools}>
            <Pressable
              accessibilityLabel="Open attachments and tools"
              onPress={openAttachmentSheet}
              style={({ pressed }) => [styles.chatComposerTool, pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }]}
            >
              <Ionicons name="attach-outline" color={toolIconColor} size={20} />
            </Pressable>
            <Pressable
              accessibilityLabel="Choose AI model and reasoning effort"
              onPress={() => setModelMenuOpen((open) => !open)}
              style={({ pressed }) => [styles.chatModelEffortControl, pressed && { opacity: 0.82 }]}
            >
              {inlineTool && inlineToolAccent ? (
                <View style={[styles.chatModelToolTag, { backgroundColor: inlineToolAccent.backgroundColor, borderColor: inlineToolAccent.borderColor }]}>
                  <Ionicons name={chatToolIcons[inlineTool]} color={inlineToolAccent.iconColor} size={13} />
                  <Text numberOfLines={1} style={[styles.chatModelToolTagText, { color: inlineToolAccent.textColor }]}>{chatToolLabels[inlineTool]}</Text>
                  <Pressable
                    accessibilityLabel={`Clear ${chatToolLabels[inlineTool]}`}
                    hitSlop={8}
                    onPress={clearInlineTool}
                    style={({ pressed }) => [styles.chatModelToolTagClear, pressed && { opacity: 0.58 }]}
                  >
                    <Ionicons name="close" color={inlineToolAccent.iconColor} size={11} />
                  </Pressable>
                </View>
              ) : (
                <>
                  <Text numberOfLines={1} style={styles.chatModelInlineLabel}>{currentModel.label}</Text>
                  <Text style={styles.chatModelInlineDivider}>/</Text>
                  <Text style={styles.chatEffortInlineLabel}>{effortShortLabel(props.reasoningEffort)}</Text>
                </>
              )}
            </Pressable>
          </View>
          <Pressable style={({ pressed }) => [styles.chatSendButton, pressed && styles.chatSendButtonPressed]} onPress={sendLocked ? undefined : handleStart}>
            <LinearGradient colors={sendGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.chatSendGradient}>
              <Ionicons name={sendLocked ? "pause" : "arrow-up"} color={colors.text} size={22} />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
      <View style={styles.chatComposerStatusRow}>
        <PcPermissionControl onOpenConnect={props.onOpenPcConnection} projectId={props.projectId} />
        <ProjectMemoryBar chatMessages={props.chatMessages} projectId={props.projectId} taskText={props.taskText} />
      </View>
      <ChatAttachmentSheet
        visible={attachmentSheetOpen}
        onClose={() => setAttachmentSheetOpen(false)}
        onSelectFileAttachment={selectFileAttachment}
        onSelectImageAttachment={selectImageAttachment}
        onSelectPrompt={selectAttachmentPrompt}
        onSelectTool={selectAttachmentTool}
      />
      <BillingSheet visible={billingSheetOpen} onClose={() => setBillingSheetOpen(false)} />
    </View>
  );
}
