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
  const warningColor = useThemedColor("#FFD166");
  const warningTextColor = useThemedColor("#FFF4C7");
  const closeColor = useThemedColor("#D9D4E8");
  const light = prefs.effectiveScheme === "light";
  const cardStyle = light ? { backgroundColor: prefs.colors.surface, borderColor: "rgba(183, 121, 31, 0.28)", shadowColor: prefs.colors.shadow } : null;
  const titleStyle = light ? { color: prefs.colors.warning } : null;
  const metaStyle = light ? { color: prefs.colors.muted } : null;
  const summaryStyle = light ? { color: prefs.colors.text } : null;
  const messageBoxStyle = light ? { backgroundColor: prefs.colors.elevated } : null;
  const diagnosticStyle = light ? { backgroundColor: prefs.colors.surface, borderColor: prefs.colors.border } : null;
  const messageStyle = light ? { color: prefs.colors.text } : null;
  const secondaryStyle = light ? { backgroundColor: prefs.colors.warningSoft, borderColor: "rgba(183, 121, 31, 0.2)" } : null;
  const askStyle = light ? { backgroundColor: prefs.colors.accent } : null;
  const [expanded, setExpanded] = useState(false);
  const latest = errors[errors.length - 1];
  const orderedErrors = useMemo(() => [...errors].reverse(), [errors]);
  if (!latest) return null;
  const location = formatLocation(latest, " · ");
  const summary = firstLine(latest.message || latest.stack || "Preview runtime error");
  return (
    <View style={[previewErrorStyles.card, cardStyle, expanded ? previewErrorStyles.cardExpanded : null, { bottom: bottomOffset }]}>
      <View style={previewErrorStyles.header}>
        <View style={previewErrorStyles.icon}>
          <Ionicons name="warning-outline" color={warningColor} size={17} />
        </View>
        <View style={previewErrorStyles.titleWrap}>
          <Text style={[previewErrorStyles.title, titleStyle]}>Preview error</Text>
          <Text numberOfLines={1} style={[previewErrorStyles.meta, metaStyle]}>{location || latest.type}{errors.length > 1 ? ` · ${errors.length} captured` : ""}</Text>
        </View>
        <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={8} style={previewErrorStyles.detailButton}>
          <Text style={[previewErrorStyles.detailText, { color: warningTextColor }]}>{expanded ? "Hide" : "Details"}</Text>
          <Ionicons name={expanded ? "chevron-down" : "chevron-up"} color={warningTextColor} size={15} />
        </Pressable>
        <Pressable onPress={onDismiss} hitSlop={8} style={previewErrorStyles.dismiss}>
          <Ionicons name="close" color={closeColor} size={18} />
        </Pressable>
      </View>
      <Text numberOfLines={expanded ? 2 : 1} style={[previewErrorStyles.summary, summaryStyle]}>{summary}</Text>
      {expanded ? (
        <ScrollView style={[previewErrorStyles.messageBox, messageBoxStyle]} contentContainerStyle={previewErrorStyles.messageContent}>
          {orderedErrors.map((item, index) => (
            <View key={`${item.type}-${item.message}-${item.line ?? ""}-${index}`} style={[previewErrorStyles.diagnostic, diagnosticStyle]}>
              <View style={previewErrorStyles.diagnosticHeader}>
                <Text style={previewErrorStyles.badge}>{item.type}</Text>
                <Text numberOfLines={1} style={[previewErrorStyles.diagnosticMeta, metaStyle]}>{formatLocation(item, " · ") || `Captured ${orderedErrors.length - index}`}</Text>
              </View>
              <Text selectable style={[previewErrorStyles.message, messageStyle]}>{item.stack || item.message}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <View style={previewErrorStyles.actions}>
        <Pressable onPress={() => setExpanded((v) => !v)} style={({ pressed }) => [previewErrorStyles.secondaryButton, secondaryStyle, pressed ? previewErrorStyles.askButtonPressed : null]}>
          <Ionicons name={expanded ? "contract-outline" : "expand-outline"} color={warningTextColor} size={15} />
          <Text style={[previewErrorStyles.secondaryText, { color: warningTextColor }]}>{expanded ? "Collapse" : "Expand"}</Text>
        </Pressable>
        <Pressable onPress={onAskAi} style={({ pressed }) => [previewErrorStyles.askButton, askStyle, pressed ? previewErrorStyles.askButtonPressed : null]}>
          <Ionicons name="sparkles-outline" color="#FFFFFF" size={15} />
          <Text style={previewErrorStyles.askText}>Ask AI to fix</Text>
        </Pressable>
      </View>
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
  actions: { alignItems: "center", flexDirection: "row", gap: 9, marginTop: 12 },
  askButton: {
    alignItems: "center", backgroundColor: "#8E3CFF", borderRadius: 12,
    flexDirection: "row", gap: 7, paddingHorizontal: 12, paddingVertical: 10
  },
  askButtonPressed: { opacity: 0.78 },
  askText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  badge: {
    backgroundColor: "rgba(255, 209, 102, 0.14)", borderColor: "rgba(255, 209, 102, 0.28)",
    borderRadius: 999, borderWidth: 1, color: "#FFF4C7", fontSize: 10,
    fontWeight: "900", overflow: "hidden", paddingHorizontal: 7, paddingVertical: 3,
    textTransform: "uppercase"
  },
  card: {
    backgroundColor: "rgba(10, 12, 20, 0.97)", borderColor: "rgba(255, 209, 102, 0.34)",
    borderRadius: 18, borderWidth: 1, left: 14, maxHeight: "52%",
    padding: 13, position: "absolute", right: 14, shadowColor: "#000000",
    shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.3, shadowRadius: 28, zIndex: 12
  },
  cardExpanded: { maxHeight: "72%" },
  detailButton: {
    alignItems: "center", backgroundColor: "rgba(255, 209, 102, 0.1)",
    borderRadius: 999, flexDirection: "row", gap: 4, paddingHorizontal: 9, paddingVertical: 7
  },
  detailText: { color: "#FFF4C7", fontSize: 11, fontWeight: "900" },
  diagnostic: {
    backgroundColor: "rgba(255,255,255,0.045)", borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 12, borderWidth: 1, padding: 10
  },
  diagnosticHeader: { alignItems: "center", flexDirection: "row", gap: 8, marginBottom: 8 },
  diagnosticMeta: { color: "#AAA6BC", flex: 1, fontSize: 11, fontWeight: "700", minWidth: 0 },
  dismiss: { alignItems: "center", height: 28, justifyContent: "center", width: 28 },
  header: { alignItems: "center", flexDirection: "row", gap: 9 },
  icon: {
    alignItems: "center", backgroundColor: "rgba(255, 209, 102, 0.12)",
    borderRadius: 999, height: 30, justifyContent: "center", width: 30
  },
  message: {
    color: "#F3EEFF",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 11,
    lineHeight: 16
  },
  messageContent: { gap: 9, padding: 10 },
  messageBox: {
    backgroundColor: "rgba(2, 4, 12, 0.62)", borderRadius: 14,
    marginTop: 10, maxHeight: 230
  },
  meta: { color: "#AAA6BC", fontSize: 11, fontWeight: "700", marginTop: 1 },
  secondaryButton: {
    alignItems: "center", backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.1)", borderRadius: 12, borderWidth: 1,
    flexDirection: "row", gap: 6, paddingHorizontal: 10, paddingVertical: 10
  },
  secondaryText: { color: "#FFF4C7", fontSize: 13, fontWeight: "900" },
  summary: { color: "#F7F2FF", fontSize: 12, fontWeight: "700", lineHeight: 17, marginTop: 9 },
  title: { color: "#FFD166", fontSize: 14, fontWeight: "900" },
  titleWrap: { flex: 1, minWidth: 0 }
});
