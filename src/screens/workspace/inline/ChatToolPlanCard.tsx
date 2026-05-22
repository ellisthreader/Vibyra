import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePreferences } from "../../../context/PreferencesContext";
import type { ChatToolMode, ChatToolPlanDraft } from "../../../types/chatTools";
import { chatToolIcons, chatToolLabels, chatToolLoadingText, chatToolPreviewKickers, chatToolStrongColors } from "./chatAttachmentTools";

export type ChatToolPlanPreview = {
  countdown: number | null;
  loading: boolean;
  onCancel: () => void;
  onEdit: () => void;
  onStart: () => void;
  plan: ChatToolPlanDraft | null;
  tool: ChatToolMode;
};

export function buildChatToolPlan(tool: ChatToolMode, prompt: string): ChatToolPlanDraft {
  const subject = prompt.replace(/^\/\w+\b/i, "").trim().replace(/\s+/g, " ").replace(/[?.!]+$/, "");
  const title = titleFromPrompt(subject || chatToolLabels[tool]);
  return { title, steps: toolPlanSteps(tool, subject || "the request") };
}

export function formatToolPlanForChat(prompt: string, tool: ChatToolMode, plan: ChatToolPlanDraft) {
  return `${prompt.trim()}\n\n${chatToolLabels[tool]} plan: ${plan.title}\n${plan.steps.map((step) => `- ${step}`).join("\n")}`;
}

export function ChatToolPlanCard({ countdown, loading, onCancel, onEdit, onStart, plan, tool }: ChatToolPlanPreview) {
  const prefs = usePreferences();
  if (!plan && !loading) return null;
  const palette = prefs.colors;
  const toolColors = chatToolStrongColors[tool];
  const light = prefs.effectiveScheme === "light";
  const iconColor = light ? toolColors.accent : toolColors.iconColor;
  const title = loading ? loadingTitle(tool) : plan?.title;

  return (
    <View style={[styles.card, { backgroundColor: palette.elevated, borderColor: light ? toolColors.border : "rgba(176, 132, 255, 0.22)" }]}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: toolColors.iconBackground, borderColor: toolColors.border }]}>
          <Ionicons name={chatToolIcons[tool]} color={iconColor} size={16} />
        </View>
        <View style={styles.titleBlock}>
          <Text style={[styles.kicker, { color: light ? toolColors.accent : toolColors.iconColor }]}>{chatToolPreviewKickers[tool]}</Text>
          <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
        </View>
      </View>

      {loading ? (
        <>
          <Text style={[styles.loadingText, { color: palette.dim }]}>{chatToolLoadingText[tool]}</Text>
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={({ pressed }) => [styles.secondaryButton, { borderColor: palette.border }, pressed && styles.pressed]}>
              <Text style={[styles.secondaryText, { color: palette.text }]}>Cancel</Text>
            </Pressable>
          </View>
        </>
      ) : plan ? (
        <>
          <View style={styles.steps}>
            {plan.steps.map((step) => (
              <View key={step} style={styles.stepRow}>
                <Text style={[styles.stepBullet, { color: toolColors.accent }]}>•</Text>
                <Text style={[styles.stepText, { color: palette.text }]}>{step}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.timer, { color: palette.dim }]}>
            {countdown === null ? "Ready to start" : `Starts in ${countdown}s`}
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={onEdit} style={({ pressed }) => [styles.secondaryButton, { borderColor: palette.border }, pressed && styles.pressed]}>
              <Text style={[styles.secondaryText, { color: palette.text }]}>Edit</Text>
            </Pressable>
            <Pressable onPress={onCancel} style={({ pressed }) => [styles.secondaryButton, { borderColor: palette.border }, pressed && styles.pressed]}>
              <Text style={[styles.secondaryText, { color: palette.text }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onStart} style={({ pressed }) => [styles.startButton, { backgroundColor: toolColors.accent }, pressed && styles.pressed]}>
              <Text style={styles.startText}>Start</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

function titleFromPrompt(value: string) {
  const words = value.split(/\s+/).filter(Boolean).slice(0, 7);
  const raw = words.length > 0 ? words.join(" ") : "Tool run";
  return raw.split(" ").map((word) => word.toLowerCase() === "uk" ? "UK" : word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function loadingTitle(tool: ChatToolMode) {
  if (tool === "research") return "Creating plan...";
  if (tool === "web") return "Preparing search...";
  return "Preparing image...";
}

function toolPlanSteps(tool: ChatToolMode, subject: string) {
  if (tool === "image") {
    return [
      `Extract the visual goal and audience from ${subject}.`,
      "Choose a polished screenshot-style composition.",
      "Generate one clean visual result with useful detail.",
      "Return the image with a concise result note."
    ];
  }
  if (tool === "web") {
    return [
      `Search current sources for ${subject}.`,
      "Prioritize recent, reputable, and primary references.",
      "Compare findings and call out uncertainty.",
      "Summarize with links, caveats, and next steps."
    ];
  }
  return [
    `Collect recent primary and reputable secondary sources for ${subject}.`,
    "Extract facts, dates, figures, and credibility signals.",
    "Compare disagreements and evidence gaps.",
    "Summarize source-backed findings and practical next steps."
  ];
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: 8, marginTop: 14 },
  card: { borderRadius: 14, borderWidth: 1, marginBottom: 10, padding: 13, width: "100%" },
  header: { alignItems: "center", flexDirection: "row", gap: 12 },
  icon: { alignItems: "center", borderRadius: 11, borderWidth: 1, height: 34, justifyContent: "center", width: 34 },
  kicker: { fontSize: 11, fontWeight: "900", letterSpacing: 0, lineHeight: 15, textTransform: "uppercase" },
  loadingText: { fontSize: 12.5, fontWeight: "700", lineHeight: 18, marginTop: 10 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  secondaryButton: { alignItems: "center", borderRadius: 9, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 38 },
  secondaryText: { fontSize: 13, fontWeight: "900", lineHeight: 17 },
  startButton: { alignItems: "center", borderRadius: 9, flex: 1, justifyContent: "center", minHeight: 38 },
  startText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900", lineHeight: 17 },
  stepBullet: { fontSize: 16, fontWeight: "900", lineHeight: 19, marginTop: -1 },
  stepRow: { flexDirection: "row", gap: 10 },
  stepText: { flex: 1, fontSize: 12.5, fontWeight: "700", lineHeight: 18 },
  steps: { gap: 8, marginTop: 13 },
  timer: { fontSize: 12, fontWeight: "800", lineHeight: 16, marginTop: 12 },
  title: { fontSize: 15, fontWeight: "900", lineHeight: 20 },
  titleBlock: { flex: 1, minWidth: 0 }
});
