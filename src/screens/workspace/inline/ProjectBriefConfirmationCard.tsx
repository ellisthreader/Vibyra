import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../../styles/theme";
import { usePreferences, useThemedColor } from "../../../context/PreferencesContext";
import type { ProjectBriefSetupPrompt } from "../../../types/projectAnalysis";

export function ProjectBriefConfirmationCard({ setup, onChange, onConfirm }: {
  setup: ProjectBriefSetupPrompt;
  onChange?: (projectId: string) => void;
  onConfirm?: (projectId: string, brief: NonNullable<ProjectBriefSetupPrompt["detectedBrief"]>) => void;
}) {
  const prefs = usePreferences();
  const accentIconColor = useThemedColor("#D7C4FF");
  const analyzingColor = useThemedColor("#B084FF");
  const cardStyle = prefs.effectiveScheme === "light" ? { backgroundColor: prefs.colors.surface, borderColor: prefs.colors.border } : null;
  const titleStyle = prefs.effectiveScheme === "light" ? { color: prefs.colors.text } : null;
  const bodyStyle = prefs.effectiveScheme === "light" ? { color: prefs.colors.muted } : null;
  const evidenceStyle = prefs.effectiveScheme === "light" ? { color: prefs.colors.dim } : null;
  const kickerStyle = prefs.effectiveScheme === "light" ? { color: prefs.colors.accent } : null;
  if (setup.status === "analyzing") {
    return (
      <View style={[styles.card, cardStyle]}>
        <View style={styles.row}>
          <ActivityIndicator color={analyzingColor} />
          <View style={styles.textStack}>
            <Text style={[styles.title, titleStyle]}>Analyzing folder</Text>
            <Text style={[styles.body, bodyStyle]}>Checking files, frameworks, and page clues without using AI.</Text>
          </View>
        </View>
      </View>
    );
  }

  const brief = setup.detectedBrief;
  const confirmed = setup.status === "confirmed";
  return (
    <View style={[styles.card, cardStyle]}>
      <View style={styles.kicker}>
        <Ionicons name={confirmed ? "checkmark-circle-outline" : "scan-outline"} color={accentIconColor} size={13} />
        <Text style={[styles.kickerText, kickerStyle]}>{confirmed ? "Confirmed" : "Folder analysis"}</Text>
      </View>
      <Text style={[styles.title, titleStyle]}>{brief ? `${brief.kindLabel} · ${brief.frameworkLabel}` : "I need your help classifying this"}</Text>
      <Text style={[styles.body, bodyStyle]}>{confirmed ? "Saved for this project. I won't ask again when you reopen it." : setup.analysis?.summary ?? "I checked the folder but could not identify enough reliable signals."}</Text>
      {setup.analysis?.evidence?.length ? <Text numberOfLines={2} style={[styles.evidence, evidenceStyle]}>Purpose: {setup.analysis.evidence.join(", ")}</Text> : null}
      {setup.analysis?.techEvidence?.length ? <Text numberOfLines={2} style={[styles.evidence, evidenceStyle]}>Tech: {setup.analysis.techEvidence.join(", ")}</Text> : null}
      {confirmed ? null : (
        <View style={styles.actions}>
          <Button label="Change" tone="ghost" onPress={() => onChange?.(setup.projectId)} />
          {brief ? <Button label="Confirm" tone="primary" onPress={() => onConfirm?.(setup.projectId, brief)} /> : null}
        </View>
      )}
    </View>
  );
}

function Button({ label, tone, onPress }: { label: string; tone: "ghost" | "primary"; onPress: () => void }) {
  const prefs = usePreferences();
  const ghostStyle = prefs.effectiveScheme === "light" ? { borderColor: prefs.colors.border } : null;
  const ghostTextStyle = prefs.effectiveScheme === "light" ? { color: prefs.colors.text } : null;
  const primaryStyle = prefs.effectiveScheme === "light" ? { backgroundColor: prefs.colors.accent } : null;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.button, tone === "primary" ? [styles.primary, primaryStyle] : [styles.ghost, ghostStyle], pressed && styles.pressed]}>
      <Text style={tone === "primary" ? styles.primaryText : [styles.ghostText, ghostTextStyle]}>{label}</Text>
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
