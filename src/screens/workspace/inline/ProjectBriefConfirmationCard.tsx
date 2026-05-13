import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../../styles/theme";
import type { ProjectBriefSetupPrompt } from "../../../types/projectAnalysis";

export function ProjectBriefConfirmationCard({ setup, onChange, onConfirm }: {
  setup: ProjectBriefSetupPrompt;
  onChange?: (projectId: string) => void;
  onConfirm?: (projectId: string) => void;
}) {
  if (setup.status === "analyzing") {
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <ActivityIndicator color="#B084FF" />
          <View style={styles.textStack}>
            <Text style={styles.title}>Analyzing folder</Text>
            <Text style={styles.body}>Checking files, frameworks, and page clues without using AI.</Text>
          </View>
        </View>
      </View>
    );
  }

  const brief = setup.detectedBrief;
  const confirmed = setup.status === "confirmed";
  return (
    <View style={styles.card}>
      <View style={styles.kicker}>
        <Ionicons name={confirmed ? "checkmark-circle-outline" : "scan-outline"} color="#D7C4FF" size={13} />
        <Text style={styles.kickerText}>{confirmed ? "Confirmed" : "Folder analysis"}</Text>
      </View>
      <Text style={styles.title}>{brief ? `${brief.kindLabel} · ${brief.frameworkLabel}` : "I need your help classifying this"}</Text>
      <Text style={styles.body}>{confirmed ? "Saved for this project. I won't ask again when you reopen it." : setup.analysis?.summary ?? "I checked the folder but could not identify enough reliable signals."}</Text>
      {setup.analysis?.evidence?.length ? <Text numberOfLines={2} style={styles.evidence}>Purpose: {setup.analysis.evidence.join(", ")}</Text> : null}
      {setup.analysis?.techEvidence?.length ? <Text numberOfLines={2} style={styles.evidence}>Tech: {setup.analysis.techEvidence.join(", ")}</Text> : null}
      {confirmed ? null : (
        <View style={styles.actions}>
          <Button label="Change" tone="ghost" onPress={() => onChange?.(setup.projectId)} />
          {brief ? <Button label="Confirm" tone="primary" onPress={() => onConfirm?.(setup.projectId)} /> : null}
        </View>
      )}
    </View>
  );
}

function Button({ label, tone, onPress }: { label: string; tone: "ghost" | "primary"; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.button, tone === "primary" ? styles.primary : styles.ghost, pressed && styles.pressed]}>
      <Text style={tone === "primary" ? styles.primaryText : styles.ghostText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  body: { color: "#D5D0E6", fontSize: 13, fontWeight: "700", lineHeight: 18 },
  button: { borderRadius: 999, minHeight: 36, paddingHorizontal: 14, justifyContent: "center" },
  card: { backgroundColor: "rgba(15, 17, 26, 0.92)", borderColor: "rgba(176,132,255,0.22)", borderRadius: 14, borderWidth: 1, gap: 10, marginTop: 10, padding: 14 },
  evidence: { color: "#8F8A9E", fontSize: 11, fontWeight: "700" },
  ghost: { borderColor: "rgba(255,255,255,0.14)", borderWidth: 1 },
  ghostText: { color: "#D5D0E6", fontSize: 13, fontWeight: "800" },
  kicker: { alignItems: "center", flexDirection: "row", gap: 6 },
  kickerText: { color: "#D7C4FF", fontSize: 11, fontWeight: "900" },
  pressed: { opacity: 0.84 },
  primary: { backgroundColor: "#8E3CFF" },
  primaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  row: { alignItems: "center", flexDirection: "row", gap: 12 },
  textStack: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 15, fontWeight: "900" }
});
