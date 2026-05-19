import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ProjectBriefSetupPrompt } from "../../../types/projectAnalysis";
import { useChatActionCardPalette } from "./chatActionCardTheme";

export function ProjectBriefConfirmationCard({ setup, onChange, onConfirm }: {
  setup: ProjectBriefSetupPrompt;
  onChange?: (projectId: string) => void;
  onConfirm?: (projectId: string, brief: NonNullable<ProjectBriefSetupPrompt["detectedBrief"]>) => void;
}) {
  const palette = useChatActionCardPalette();
  const cardColors = { backgroundColor: palette.cardBg, borderColor: palette.cardBorder };

  if (setup.status === "analyzing") {
    return (
      <View style={[styles.card, cardColors]}>
        <View style={styles.loadingRow}>
          <View style={[styles.loadingIcon, { backgroundColor: palette.iconBg }]}>
            <ActivityIndicator color={palette.iconColor} />
          </View>
          <View style={styles.textStack}>
            <Text style={[styles.title, { color: palette.text }]}>Checking folder</Text>
            <Text style={[styles.body, { color: palette.body }]}>Looking at files and framework clues.</Text>
          </View>
        </View>
      </View>
    );
  }

  const brief = setup.detectedBrief;
  const confirmed = setup.status === "confirmed";
  const signals = compactSignals(setup);

  return (
    <View style={[styles.card, cardColors]}>
      <View style={styles.statusRow}>
        <Ionicons
          name={confirmed ? "checkmark-circle" : brief ? "scan-outline" : "help-circle-outline"}
          color={palette.iconColor}
          size={15}
        />
        <Text style={[styles.statusText, { color: palette.kicker }]}>
          {confirmed ? "Project type saved" : brief ? "Analyzed folder" : "Needs project type"}
        </Text>
      </View>
      <Text style={[styles.title, { color: palette.text }]}>
        {brief ? `${brief.kindLabel} · ${brief.frameworkLabel}` : "Choose the project type"}
      </Text>
      <Text style={[styles.body, { color: palette.body }]}>
        {confirmed
          ? "Saved for this project. I won't ask again when you reopen it."
          : brief
            ? setup.analysis?.summary ?? "I found enough local signals to use this setup."
            : "I could not identify enough reliable signals. Pick the closest setup to continue."}
      </Text>
      {signals.length > 0 ? (
        <View style={styles.signals}>
          {signals.map((signal) => (
            <View key={signal} style={[styles.signalChip, { backgroundColor: palette.chipBg, borderColor: palette.chipBorder }]}>
              <Text numberOfLines={1} style={[styles.signalText, { color: palette.buttonGhostText }]}>{signal}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {confirmed ? null : (
        <View style={styles.actions}>
          {brief ? <Button label="Change" palette={palette} tone="ghost" onPress={() => onChange?.(setup.projectId)} /> : null}
          <Button
            label={brief ? "Confirm" : "Choose type"}
            palette={palette}
            tone="primary"
            onPress={() => brief ? onConfirm?.(setup.projectId, brief) : onChange?.(setup.projectId)}
          />
        </View>
      )}
    </View>
  );
}

function Button({ label, palette, tone, onPress }: {
  label: string;
  palette: ReturnType<typeof useChatActionCardPalette>;
  tone: "ghost" | "primary";
  onPress: () => void;
}) {
  const primary = tone === "primary";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: palette.buttonPrimary }
          : { backgroundColor: palette.buttonGhostBg, borderColor: palette.buttonGhostBorder, borderWidth: 1 },
        pressed && styles.pressed
      ]}
    >
      <Text style={[styles.buttonText, { color: primary ? palette.primaryText : palette.buttonGhostText }]}>{label}</Text>
    </Pressable>
  );
}

function compactSignals(setup: ProjectBriefSetupPrompt) {
  const evidence = setup.analysis?.evidence ?? [];
  const techEvidence = setup.analysis?.techEvidence ?? [];
  return [...evidence, ...techEvidence]
    .map((signal) => signal.trim())
    .filter(Boolean)
    .slice(0, 3);
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: 8, justifyContent: "flex-end", marginTop: 2 },
  body: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  button: { alignItems: "center", borderRadius: 999, flex: 1, justifyContent: "center", minHeight: 38, paddingHorizontal: 14 },
  buttonText: { fontSize: 13, fontWeight: "800" },
  card: { borderRadius: 14, borderWidth: 1, gap: 9, marginTop: 10, padding: 14 },
  loadingIcon: { alignItems: "center", borderRadius: 999, height: 34, justifyContent: "center", width: 34 },
  loadingRow: { alignItems: "center", flexDirection: "row", gap: 11 },
  pressed: { opacity: 0.84 },
  signalChip: { borderRadius: 999, borderWidth: 1, maxWidth: "100%", minHeight: 26, paddingHorizontal: 9, paddingVertical: 5 },
  signals: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  signalText: { fontSize: 11, fontWeight: "700" },
  statusRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  statusText: { fontSize: 11, fontWeight: "800" },
  textStack: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: "900", lineHeight: 21 }
});
