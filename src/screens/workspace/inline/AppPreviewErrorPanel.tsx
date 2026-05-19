import React, { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { PreviewRuntimeError } from "../../../components/AppWebView";
import { usePreferences, useThemedColor } from "../../../context/PreferencesContext";

export function PreviewErrorPanel({ bottomOffset, errors, onAskAi, onDismiss }: {
  bottomOffset: number;
  errors: PreviewRuntimeError[];
  onAskAi: () => void;
  onDismiss: () => void;
}) {
  const prefs = usePreferences();
  const accentColor = useThemedColor("#8E3CFF");
  const warningColor = useThemedColor("#FF5F76");
  const closeColor = useThemedColor("#C8C1D8");
  const light = prefs.effectiveScheme === "light";
  const cardStyle = light ? { backgroundColor: prefs.colors.surface, borderColor: prefs.colors.border, shadowColor: prefs.colors.shadow } : null;
  const titleStyle = light ? { color: prefs.colors.text } : null;
  const metaStyle = light ? { color: prefs.colors.muted } : null;
  const summaryStyle = light ? { color: prefs.colors.text } : null;
  const detailStyle = light ? { backgroundColor: prefs.colors.elevated, borderColor: prefs.colors.border } : null;
  const messageStyle = light ? { color: prefs.colors.text } : null;
  const fixStyle = light ? { backgroundColor: prefs.colors.accent } : null;
  const [expanded, setExpanded] = useState(false);
  const latest = errors[errors.length - 1];
  const orderedErrors = useMemo(() => [...errors].reverse(), [errors]);
  if (!latest) return null;
  const location = formatLocation(latest, " · ");
  const summary = firstLine(latest.message || latest.stack || "Preview runtime error");
  return (
    <View style={[previewErrorStyles.card, cardStyle, expanded ? previewErrorStyles.cardExpanded : null, { bottom: bottomOffset }]}>
      <View style={previewErrorStyles.topRow}>
        <View style={previewErrorStyles.iconHalo}>
          <View style={[previewErrorStyles.icon, { borderColor: warningColor }]}>
            <Text style={[previewErrorStyles.iconMark, { color: warningColor }]}>!</Text>
          </View>
        </View>
        <View style={previewErrorStyles.copy}>
          <Text numberOfLines={1} style={[previewErrorStyles.title, titleStyle]}>Preview crashed</Text>
          <Text numberOfLines={expanded ? 2 : 1} style={[previewErrorStyles.summary, summaryStyle]}>{summary}</Text>
          {location || errors.length > 1 ? (
            <Text numberOfLines={1} style={[previewErrorStyles.meta, metaStyle]}>{location || latest.type}{errors.length > 1 ? ` · ${errors.length} captured` : ""}</Text>
          ) : null}
        </View>
      </View>
      <View style={previewErrorStyles.actions}>
        <Pressable onPress={onAskAi} style={({ pressed }) => [previewErrorStyles.fixButton, fixStyle, pressed ? previewErrorStyles.pressed : null]}>
          <Ionicons name="sparkles-outline" color="#FFFFFF" size={20} />
          <Text style={previewErrorStyles.fixText}>Fix with AI</Text>
        </Pressable>
        <Pressable accessibilityLabel={expanded ? "Hide preview error details" : "Show preview error details"} onPress={() => setExpanded((v) => !v)} hitSlop={8} style={previewErrorStyles.secondaryButton}>
          <Text style={[previewErrorStyles.secondaryText, { color: accentColor }]}>{expanded ? "Hide details" : "Details"}</Text>
        </Pressable>
        <Pressable accessibilityLabel="Dismiss preview error" onPress={onDismiss} hitSlop={8} style={previewErrorStyles.iconButton}>
          <Ionicons name="close" color={closeColor} size={23} />
        </Pressable>
      </View>
      {expanded ? (
        <ScrollView style={[previewErrorStyles.details, detailStyle]} contentContainerStyle={previewErrorStyles.detailContent}>
          {orderedErrors.map((item, index) => (
            <View key={`${item.type}-${item.message}-${item.line ?? ""}-${index}`} style={previewErrorStyles.diagnostic}>
              <Text numberOfLines={1} style={[previewErrorStyles.diagnosticMeta, metaStyle]}>{item.type}{formatLocation(item, " · ") ? ` · ${formatLocation(item, " · ")}` : ""}</Text>
              <Text selectable style={[previewErrorStyles.message, messageStyle]}>{item.stack || item.message}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function firstLine(value: string) {
  return value.split("\n").find(Boolean)?.trim() || "Preview runtime error";
}

function formatLocation(error: PreviewRuntimeError, separator: string) {
  return [error.source, error.line ? `line ${error.line}` : "", error.column ? `col ${error.column}` : ""].filter(Boolean).join(separator);
}

const previewErrorStyles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(6, 8, 18, 0.96)", borderColor: "rgba(142,60,255,0.55)",
    borderRadius: 20, borderWidth: 1, left: 16, maxHeight: "52%", padding: 14,
    position: "absolute", right: 16, shadowColor: "#000000", shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24, shadowRadius: 20, zIndex: 12
  },
  cardExpanded: { maxHeight: "68%" },
  actions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 14 },
  copy: { flex: 1, minWidth: 0 },
  detailContent: { gap: 9, padding: 9 },
  details: {
    backgroundColor: "rgba(255,255,255,0.055)", borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 10, borderWidth: 1, marginTop: 10, maxHeight: 220
  },
  diagnostic: { gap: 6 },
  diagnosticMeta: { color: "#A7A1B7", fontSize: 11, fontWeight: "700" },
  fixButton: {
    alignItems: "center", backgroundColor: "#8E3CFF", borderRadius: 14, flex: 1.15, flexDirection: "row", gap: 8,
    justifyContent: "center", minHeight: 48, minWidth: 118, paddingHorizontal: 14
  },
  fixText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  icon: { alignItems: "center", borderRadius: 999, borderWidth: 2.5, height: 40, justifyContent: "center", width: 40 },
  iconButton: {
    alignItems: "center", backgroundColor: "rgba(255,255,255,0.035)", borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14, borderWidth: 1, height: 48, justifyContent: "center", width: 48
  },
  iconHalo: { alignItems: "center", backgroundColor: "rgba(255,95,118,0.13)", borderRadius: 999, height: 60, justifyContent: "center", width: 60 },
  iconMark: { fontSize: 25, fontWeight: "900", lineHeight: 28 },
  message: {
    color: "#EEE8FA",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 11,
    lineHeight: 16
  },
  meta: { color: "#A7A1B7", fontSize: 10.5, fontWeight: "700", marginTop: 4 },
  pressed: { opacity: 0.78 },
  summary: { color: "#D7D0E8", fontSize: 13, fontWeight: "700", lineHeight: 19, marginTop: 5 },
  title: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  secondaryButton: {
    alignItems: "center", backgroundColor: "rgba(255,255,255,0.035)", borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14, borderWidth: 1, flex: 0.7, justifyContent: "center", minHeight: 48, minWidth: 70, paddingHorizontal: 12
  },
  secondaryText: { fontSize: 14, fontWeight: "900" },
  topRow: { alignItems: "center", flexDirection: "row", gap: 12 }
});
