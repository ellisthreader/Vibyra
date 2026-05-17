import React, { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ChatSkill } from "../../../utils/appApi";
import { colors } from "../../../styles/theme";
import { ModelKey, ReasoningEffort } from "../../../types/domain";
import { useAppContext } from "../../../context/AppContext";
import { usePreferences, useThemedColor } from "../../../context/PreferencesContext";
import { ChatCommand, chatCommandHelpReply, filterChatCommands, matchChatCommand } from "../data/chatCommands";
import { chatModelOptions } from "../data/chatModels";
import { mergeChatSkills } from "../../../utils/chatSkills";
import { styles } from "../styles";
import { LowCreditsWarning, ModelProviderIcon, getUnlockedInitialChatModel, isModelLockedForPlan } from "./chunk10";
import { EffortMenu, ModelMenu, effortShortLabel } from "./ChatComposerMenus";
import { BillingSheet } from "./profile/BillingSheet";
import { SlashCommandMenu } from "./SlashCommandMenu";

type ChatComposerProps = {
  accountPlan: string;
  agentRequesting: boolean;
  bottomInset: number;
  chatSkills: ChatSkill[];
  creditPercentRemaining: number;
  creditsLow: boolean;
  onNewChat: () => void;
  onOpenFolderCommand: () => void;
  onTestPreviewCommand: (userText: string) => void;
  onOpenTokens: () => void;
  onStart: () => void;
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
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [effortMenuOpen, setEffortMenuOpen] = useState(false);
  const [billingSheetOpen, setBillingSheetOpen] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const appCtx = useAppContext();
  const prefs = usePreferences();
  const placeholderColor = useThemedColor("#8F8A9E");
  const toolIconColor = useThemedColor("#B9B5C8");
  const effortIconColor = useThemedColor("#D7C4FF");
  const lockedIconColor = useThemedColor("#AAA6BC");
  const sendGradient = props.agentRequesting
    ? (prefs.effectiveScheme === "light" ? ["#DADDE8", "#C9CEDA"] as const : ["#282B34", "#1A1C25"] as const)
    : (prefs.effectiveScheme === "light" ? ["#7C3AED", "#6D3BFF", "#4F46E5"] as const : ["#A368FF", "#5D24D8"] as const);
  const selectedChatModel = getUnlockedInitialChatModel(props.selectedModel, props.accountPlan, props.selectedChatModel);
  const currentModel = chatModelOptions.find((model) => model.key === selectedChatModel) ?? chatModelOptions[0];
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

  function selectModel(model: (typeof chatModelOptions)[number]) {
    if (isModelLockedForPlan(model, props.accountPlan)) return;
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

  function handleStart() {
    const parsed = matchChatCommand(props.taskText);
    if (parsed) {
      runCommand(parsed.command, parsed.args);
      return;
    }
    props.onStart();
  }

  return (
    <View style={[styles.chatComposerShell, { paddingBottom: Math.max(props.bottomInset, 8) }]}>
      {props.creditsLow ? <LowCreditsWarning onOpenTokens={props.onOpenTokens} percentRemaining={props.creditPercentRemaining} /> : null}
      <ModelMenu open={modelMenuOpen} accountPlan={props.accountPlan} selected={selectedChatModel} onSelect={selectModel} onUpgrade={() => { setModelMenuOpen(false); setBillingSheetOpen(true); }} />
      {slashMenuOpen ? <SlashCommandMenu commands={filteredCommands} skills={filteredSkills} onSelectCommand={(c) => runCommand(c, "")} onSelectSkill={(s) => props.setTaskText(`${s.slash} `)} /> : null}
      <EffortMenu open={effortMenuOpen} selected={props.reasoningEffort} onSelect={(effort) => { props.setReasoningEffort(effort); setEffortMenuOpen(false); }} />
      <View style={[styles.chatComposer, composerFocused && styles.chatComposerFocused]}>
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
          <Pressable style={({ pressed }) => [styles.chatComposerTool, pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }]}>
            <Ionicons name="attach-outline" color={toolIconColor} size={20} />
          </Pressable>
          <View style={styles.chatModelEffortControl}>
            <Pressable
              accessibilityLabel="Choose AI model"
              style={({ pressed }) => [styles.chatModelLogoButton, pressed && { opacity: 0.82 }]}
              onPress={() => { setModelMenuOpen((open) => !open); setEffortMenuOpen(false); }}
            >
              <ModelProviderIcon provider={currentModel.provider} compact />
              {isModelLockedForPlan(currentModel, props.accountPlan) ? <Ionicons name="lock-closed" color={lockedIconColor} size={11} /> : null}
            </Pressable>
            <View style={styles.chatModelEffortDivider} />
            <Pressable
              accessibilityLabel="Choose reasoning effort"
              onPress={() => { setEffortMenuOpen((open) => !open); setModelMenuOpen(false); }}
              style={({ pressed }) => [styles.chatEffortInlineButton, pressed && { opacity: 0.82 }]}
            >
              <Ionicons name="flash-outline" color={effortIconColor} size={13} />
              <Text style={styles.chatEffortInlineLabel}>{effortShortLabel(props.reasoningEffort)}</Text>
            </Pressable>
          </View>
          <Pressable style={({ pressed }) => [styles.chatSendButton, pressed && styles.chatSendButtonPressed]} onPress={props.agentRequesting ? undefined : handleStart}>
            <LinearGradient colors={sendGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.chatSendGradient}>
              <Ionicons name={props.agentRequesting ? "pause" : "arrow-up"} color={colors.text} size={22} />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
      <BillingSheet visible={billingSheetOpen} onClose={() => setBillingSheetOpen(false)} />
    </View>
  );
}
