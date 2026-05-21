import React, { useEffect, useMemo, useState } from "react";
import { Keyboard, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ChatSkill } from "../../../utils/appApi";
import { colors } from "../../../styles/theme";
import type { ChatImageAttachment, ChatStartOptions, ChatToolMode, DeepResearchPlanDraft } from "../../../types/chatTools";
import { DEEP_RESEARCH_MODEL_KEY, chatToolModelOverride } from "../../../types/chatTools";
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
import { chatToolLabels } from "./chatAttachmentTools";
import { ChatImageAttachmentPills } from "./ChatImageAttachmentPills";
import { ChatUsageLimitNotice } from "./ChatUsageLimitNotice";
import { BillingSheet } from "./profile/BillingSheet";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { ProjectMemoryBar } from "./ProjectMemoryBar";
import { PcPermissionControl } from "./PcPermissionControl";
import { createDeepResearchPlan } from "../../../utils/researchPlanApi";
import { buildDeepResearchPlan, formatDeepResearchPlanForChat, type DeepResearchPlanPreview } from "./DeepResearchPlanCard";

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
  onDeepResearchPreviewChange?: (preview: DeepResearchPlanPreview | null) => void;
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
  type PendingDeepResearchPlan = {
    countdown: number;
    draft: DeepResearchPlanDraft;
    options?: ChatStartOptions;
    prompt: string;
  };
  const [attachmentSheetOpen, setAttachmentSheetOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<ChatToolMode | null>(null);
  const [modelBeforeTool, setModelBeforeTool] = useState<string | null>(null);
  const [imageAttachments, setImageAttachments] = useState<ChatImageAttachment[]>([]);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [billingSheetOpen, setBillingSheetOpen] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [deepResearchPlanning, setDeepResearchPlanning] = useState(false);
  const [pendingDeepResearchPlan, setPendingDeepResearchPlan] = useState<PendingDeepResearchPlan | null>(null);
  const appCtx = useAppContext();
  const prefs = usePreferences();
  const placeholderColor = useThemedColor("#8F8A9E");
  const toolIconColor = useThemedColor("#B9B5C8");
  const sendLocked = props.agentRequesting || deepResearchPlanning;
  const sendGradient = sendLocked
    ? (prefs.effectiveScheme === "light" ? ["#DADDE8", "#C9CEDA"] as const : ["#282B34", "#1A1C25"] as const)
    : (prefs.effectiveScheme === "light" ? ["#7C3AED", "#6D3BFF", "#4F46E5"] as const : ["#A368FF", "#5D24D8"] as const);
  const slashToolMatch = props.taskText.trim().match(/^\/(research|web|analyze)(?:\s|\b)/i);
  const slashTool = slashToolMatch?.[1]?.toLowerCase() as ChatToolMode | undefined;
  const slashModelOverride = slashTool ? chatToolModelOverride(slashTool) : "";
  const activeToolModel = chatToolModelOverride(activeTool) || slashModelOverride;
  const selectedChatModel = activeToolModel || getUnlockedInitialChatModel(props.selectedModel, props.accountPlan, props.selectedChatModel);
  const currentModel = chatModelOptionFor(selectedChatModel) ?? chatModelOptions[0];
  const deepResearchActive = currentModel.key === DEEP_RESEARCH_MODEL_KEY;
  const visibleToolPill = activeTool && activeTool !== "research" ? activeTool : null;
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
    if (!pendingDeepResearchPlan) return;
    if (pendingDeepResearchPlan.countdown <= 0) {
      startDeepResearchPlan();
      return;
    }
    const timer = setTimeout(() => {
      setPendingDeepResearchPlan((current) => current ? { ...current, countdown: current.countdown - 1 } : current);
    }, 1000);
    return () => clearTimeout(timer);
  }, [pendingDeepResearchPlan]);

  useEffect(() => {
    props.onDeepResearchPreviewChange?.(
      deepResearchPlanning || pendingDeepResearchPlan
        ? {
          countdown: pendingDeepResearchPlan?.countdown ?? 0,
          loading: deepResearchPlanning,
          onCancel: cancelDeepResearchPlan,
          onEdit: editDeepResearchPlan,
          onStart: startDeepResearchPlan,
          plan: pendingDeepResearchPlan?.draft ?? null
        }
        : null
    );
  }, [deepResearchPlanning, pendingDeepResearchPlan?.countdown, pendingDeepResearchPlan?.draft, pendingDeepResearchPlan?.prompt]);

  useEffect(() => () => props.onDeepResearchPreviewChange?.(null), []);

  function selectModel(model: (typeof chatModelOptions)[number]) {
    if (isModelLockedForPlan(model, props.accountPlan)) return;
    const activeToolOverride = chatToolModelOverride(activeTool);
    if (activeToolOverride && model.key !== activeToolOverride) {
      setActiveTool(null);
    }
    setModelBeforeTool(null);
    props.setSelectedChatModel(model.key);
    if (model.modelKey) props.setSelectedModel(model.modelKey);
    setModelMenuOpen(false);
  }

  function runCommand(command: ChatCommand, args: string) {
    const userText = args ? `${command.slash} ${args}` : command.slash;
    props.setTaskText("");
    if (command.kind === "help") appCtx.addLocalChatReply(userText, chatCommandHelpReply);
    if (command.kind === "clear") appCtx.clearCurrentChat();
    if (command.kind === "new") props.onNewChat();
    if (command.kind === "open") props.onOpenFolderCommand();
    if (command.kind === "test") props.onTestPreviewCommand(userText);
  }

  async function handleStart() {
    if (deepResearchPlanning) return;
    const parsed = matchChatCommand(props.taskText);
    if (parsed) {
      runCommand(parsed.command, parsed.args);
      clearActiveTool();
      setImageAttachments([]);
      return;
    }
    const fallbackPrompt = !props.taskText.trim() && imageAttachments.length > 0
      ? "Describe this image and explain what matters for my request."
      : !props.taskText.trim() && activeTool === "image"
        ? "Create a polished image for this project."
        : undefined;
    if (!props.taskText.trim() && !fallbackPrompt) return;
    const modelOverride = chatToolModelOverride(activeTool) || slashModelOverride;
    const startOptions = activeTool || modelOverride || imageAttachments.length > 0 || fallbackPrompt ? {
      ...(fallbackPrompt ? { prompt: fallbackPrompt } : {}),
      ...(activeTool ? { tool: activeTool } : {}),
      ...(modelOverride ? { model: modelOverride } : {}),
      ...(imageAttachments.length > 0 ? { imageAttachments } : {})
    } : undefined;
    if (isDeepResearchStart(modelOverride)) {
      const prompt = fallbackPrompt ?? props.taskText.trim();
      const draft = await loadDeepResearchPlan(prompt);
      setPendingDeepResearchPlan({
        countdown: 60,
        draft,
        options: deepResearchStartOptions(prompt, draft, startOptions),
        prompt
      });
      setModelMenuOpen(false);
      return;
    }
    submitStart(startOptions);
  }

  async function loadDeepResearchPlan(prompt: string): Promise<DeepResearchPlanDraft> {
    if (!appCtx.authToken) return buildDeepResearchPlan(prompt);
    setDeepResearchPlanning(true);
    try {
      return await createDeepResearchPlan(appCtx.authToken, prompt);
    } catch {
      return buildDeepResearchPlan(prompt);
    } finally {
      setDeepResearchPlanning(false);
    }
  }

  function submitStart(options?: ChatStartOptions) {
    props.onStart(options);
    clearActiveTool();
    setImageAttachments([]);
  }

  function isDeepResearchStart(modelOverride: string) {
    return activeTool === "research" || slashTool === "research" || modelOverride === DEEP_RESEARCH_MODEL_KEY;
  }

  function cancelDeepResearchPlan() {
    setPendingDeepResearchPlan(null);
  }

  function editDeepResearchPlan() {
    if (!pendingDeepResearchPlan) return;
    props.setTaskText(formatDeepResearchPlanForChat(pendingDeepResearchPlan.prompt, pendingDeepResearchPlan.draft));
    setPendingDeepResearchPlan(null);
  }

  function startDeepResearchPlan() {
    if (!pendingDeepResearchPlan) return;
    const options = pendingDeepResearchPlan.options;
    setPendingDeepResearchPlan(null);
    submitStart(options);
  }

  function deepResearchStartOptions(prompt: string, draft: DeepResearchPlanDraft, options?: ChatStartOptions): ChatStartOptions {
    return {
      ...options,
      model: DEEP_RESEARCH_MODEL_KEY,
      prompt: formatDeepResearchPlanForChat(prompt, draft),
      tool: "research"
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
    if (chatToolModelOverride(activeTool) && modelBeforeTool) {
      props.setSelectedChatModel(modelBeforeTool);
    }
    setActiveTool(null);
    setModelBeforeTool(null);
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

  return (
    <View style={[styles.chatComposerShell, { paddingBottom: Math.max(props.bottomInset, 8) }]}>
      <ChatUsageLimitNotice messages={props.chatMessages} />
      {props.creditsLow ? <LowCreditsWarning onOpenTokens={props.onOpenTokens} percentRemaining={props.creditPercentRemaining} /> : null}
      {slashMenuOpen ? <SlashCommandMenu commands={filteredCommands} skills={filteredSkills} onSelectCommand={(c) => runCommand(c, "")} onSelectSkill={(s) => props.setTaskText(`${s.slash} `)} /> : null}
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
        {visibleToolPill ? (
          <View style={styles.chatToolPillRow}>
            <View style={styles.chatToolPill}>
              <Ionicons name={visibleToolPill === "image" ? "image-outline" : visibleToolPill === "web" ? "globe-outline" : "document-text-outline"} color="#F7F3FF" size={14} />
              <Text numberOfLines={1} style={styles.chatToolPillText}>{chatToolLabels[visibleToolPill]}</Text>
              <Pressable accessibilityLabel="Clear selected chat tool" onPress={clearActiveTool} style={styles.chatToolPillClear}>
                <Ionicons name="close" color="#BDB5CE" size={14} />
              </Pressable>
            </View>
          </View>
        ) : null}
        <ChatImageAttachmentPills attachments={imageAttachments} onRemove={(id) => setImageAttachments((current) => current.filter((item) => item.id !== id))} />
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
              {deepResearchActive ? (
                <View style={styles.chatModelToolTag}>
                  <Ionicons name="search-outline" color="#EDE2FF" size={13} />
                  <Text numberOfLines={1} style={styles.chatModelToolTagText}>Deep Research</Text>
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
      <View style={styles.chatComposerStatusRow}><PcPermissionControl onOpenConnect={props.onOpenPcConnection} projectId={props.projectId} /><ProjectMemoryBar chatMessages={props.chatMessages} projectId={props.projectId} taskText={props.taskText} /></View>
      <ChatAttachmentSheet
        visible={attachmentSheetOpen}
        onClose={() => setAttachmentSheetOpen(false)}
        onSelectImageAttachment={selectImageAttachment}
        onSelectPrompt={selectAttachmentPrompt}
        onSelectTool={selectAttachmentTool}
      />
      <BillingSheet visible={billingSheetOpen} onClose={() => setBillingSheetOpen(false)} />
    </View>
  );
}
