import React, { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { PreviewRuntimeError } from "../../../components/AppWebView";
import { usePreferences, useThemedColor } from "../../../context/PreferencesContext";

export function PreviewErrorPanel({ bottomOffset, connectedToChat, errors, onAskAi, onDismiss }: {
  bottomOffset: number;
  connectedToChat?: boolean;
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
    <View style={[
      previewErrorStyles.card,
      cardStyle,
      expanded ? previewErrorStyles.cardExpanded : null,
      connectedToChat ? previewErrorStyles.cardConnected : null,
      { bottom: bottomOffset }
    ]}>
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
          <Ionicons name="sparkles-outline" color="#FFFFFF" size={16} />
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
    borderRadius: 14, borderWidth: 1, left: 14, maxHeight: "42%", padding: 10,
    position: "absolute", right: 16, shadowColor: "#000000", shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2, shadowRadius: 16, zIndex: 22
  },
  cardConnected: {
    borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
    shadowOpacity: 0
  },
  cardExpanded: { maxHeight: "58%" },
  actions: { alignItems: "center", flexDirection: "row", gap: 7, marginTop: 10 },
  copy: { flex: 1, minWidth: 0 },
  detailContent: { gap: 8, padding: 8 },
  details: {
    backgroundColor: "rgba(255,255,255,0.055)", borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 9, borderWidth: 1, marginTop: 9, maxHeight: 170
  },
  diagnostic: { gap: 6 },
  diagnosticMeta: { color: "#A7A1B7", fontSize: 11, fontWeight: "700" },
  fixButton: {
    alignItems: "center", backgroundColor: "#8E3CFF", borderRadius: 10, flex: 1.15, flexDirection: "row", gap: 6,
    justifyContent: "center", minHeight: 38, minWidth: 106, paddingHorizontal: 12
  },
  fixText: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "900" },
  icon: { alignItems: "center", borderRadius: 999, borderWidth: 2, height: 28, justifyContent: "center", width: 28 },
  iconButton: {
    alignItems: "center", backgroundColor: "rgba(255,255,255,0.035)", borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 10, borderWidth: 1, height: 38, justifyContent: "center", width: 38
  },
  iconHalo: { alignItems: "center", backgroundColor: "rgba(255,95,118,0.10)", borderRadius: 999, height: 38, justifyContent: "center", width: 38 },
  iconMark: { fontSize: 18, fontWeight: "900", lineHeight: 21 },
  message: {
    color: "#EEE8FA",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 11,
    lineHeight: 16
  },
  meta: { color: "#A7A1B7", fontSize: 10, fontWeight: "700", marginTop: 3 },
  pressed: { opacity: 0.78 },
  summary: { color: "#D7D0E8", fontSize: 12, fontWeight: "700", lineHeight: 17, marginTop: 3 },
  title: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  secondaryButton: {
    alignItems: "center", backgroundColor: "rgba(255,255,255,0.035)", borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 10, borderWidth: 1, flex: 0.62, justifyContent: "center", minHeight: 38, minWidth: 64, paddingHorizontal: 10
  },
  secondaryText: { fontSize: 12.5, fontWeight: "900" },
  topRow: { alignItems: "center", flexDirection: "row", gap: 9 }
});
