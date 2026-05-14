import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { CodeChange, FileEntry } from "../../../types/domain";
import { usePreferences, useThemedColor } from "../../../context/PreferencesContext";
import { CollapsibleCodeBlock } from "./CollapsibleCodeBlock";

export function CodeChangesCard({ changes, files, messageId, onPreviewRevert, onUndo, projectId, undoneIds, variant = "applied" }: {
  changes: CodeChange[];
  files: FileEntry[];
  messageId: string;
  onPreviewRevert?: (messageId: string) => void;
  onUndo?: (projectId: string, messageId: string, changeId: string, file: FileEntry) => Promise<void>;
  projectId?: string;
  undoneIds: string[];
  variant?: "pending" | "applied" | "preview";
}) {
  const prefs = usePreferences();
  const warningIconColor = useThemedColor("#FFD166");
  const fileIconColor = useThemedColor("#BFAEFF");
  const actionIconColor = useThemedColor("#F3EEFF");
  const disabledIconColor = useThemedColor("#777186");
  const light = prefs.effectiveScheme === "light";
  const cardStyle = light ? { backgroundColor: prefs.colors.surface, borderColor: prefs.colors.border } : null;
  const actionStyle = light ? { backgroundColor: prefs.colors.elevated, borderColor: prefs.colors.border } : null;
  const activeActionStyle = light ? { backgroundColor: prefs.colors.accentSoft, borderColor: prefs.colors.borderStrong } : null;
  const actionTextStyle = light ? { color: prefs.colors.text } : null;
  const fileNameStyle = light ? { color: prefs.colors.text } : null;
  const kickerStyle = light ? { color: prefs.colors.accent } : null;
  const titleStyle = light ? { color: prefs.colors.text } : null;
  const pendingStyle = light ? { color: prefs.colors.muted } : null;
  const undoneStyle = light ? { color: prefs.colors.warning } : null;
  const fileIconStyle = light ? { backgroundColor: prefs.colors.accentSoft } : null;
  const headerGradient = light ? ["#7C3AED", "#6D3BFF"] as const : ["#8E3CFF", "#5D24D8"] as const;
  const [expandedPath, setExpandedPath] = useState("");
  const visibleChanges = changes.filter((change) => !change.file.includes(".vibyra-agent/runs/"));
  if (visibleChanges.length === 0) return null;
  const totalAdditions = visibleChanges.reduce((sum, change) => sum + change.additions, 0);
  const totalDeletions = visibleChanges.reduce((sum, change) => sum + change.deletions, 0);

  const isPreview = variant === "preview";
  return (
    <View style={[styles.card, cardStyle]}>
      <View style={styles.header}>
        <LinearGradient colors={headerGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerIcon}>
          <Ionicons name="git-compare-outline" color="#FFFFFF" size={20} />
        </LinearGradient>
        <View style={styles.headerBody}>
          <Text style={[styles.kicker, kickerStyle]}>{variant === "pending" ? "Review before apply" : isPreview ? "Generated code" : "Code changes"}</Text>
          <Text style={[styles.title, titleStyle]}>{visibleChanges.length} file{visibleChanges.length === 1 ? "" : "s"} {variant === "pending" || isPreview ? "ready" : "changed"}</Text>
        </View>
        <ChangeCounts additions={totalAdditions} deletions={totalDeletions} />
      </View>
      {visibleChanges.map((change) => {
        const file = files.find((item) => sameFile(item, change));
        const undone = undoneIds.includes(change.id);
        const canUndo = variant === "applied" && Boolean(projectId && file?.previousBody != null && onUndo && !undone);
        const expanded = Boolean(file && expandedPath === file.path);
        return (
          <View key={change.id} style={styles.changeGroup}>
            <View style={styles.row}>
              <View style={[styles.fileIcon, fileIconStyle]}>
                <Ionicons name={undone ? "return-up-back-outline" : expanded ? "code-slash-outline" : "document-text-outline"} color={undone ? warningIconColor : fileIconColor} size={16} />
              </View>
              <View style={styles.fileMain}>
                <Text numberOfLines={1} style={[styles.fileName, fileNameStyle]}>{fileName(change.file)}</Text>
                <View style={styles.fileStatsRow}>
                  <ChangeCounts additions={change.additions} deletions={change.deletions} compact />
                  {undone ? <Text style={[styles.undoneText, undoneStyle]}>undone</Text> : null}
                </View>
              </View>
              <Pressable disabled={!file} onPress={() => file && setExpandedPath(expanded ? "" : file.path)} style={({ pressed }) => [styles.actionButton, actionStyle, expanded ? [styles.actionButtonActive, activeActionStyle] : null, pressed && file ? styles.actionPressed : null, !file ? styles.actionDisabled : null]}>
                <Text style={[styles.actionText, actionTextStyle]}>{expanded ? "Hide" : "Review"}</Text>
              </Pressable>
              {variant === "applied" ? (
                <Pressable disabled={!canUndo} onPress={() => projectId && file && onUndo?.(projectId, messageId, change.id, file)} style={({ pressed }) => [styles.revertButton, actionStyle, pressed && canUndo ? styles.actionPressed : null, !canUndo ? styles.actionDisabled : null]}>
                  <Ionicons name="arrow-undo-outline" color={canUndo ? actionIconColor : disabledIconColor} size={14} />
                  <Text style={[styles.revertText, actionTextStyle, !canUndo ? styles.revertTextDisabled : null]}>Revert</Text>
                </Pressable>
              ) : isPreview ? (
                <Pressable accessibilityLabel="Revert generated preview code" disabled={!onPreviewRevert} onPress={() => onPreviewRevert?.(messageId)} style={({ pressed }) => [styles.previewRevertButton, actionStyle, pressed && onPreviewRevert ? styles.actionPressed : null, !onPreviewRevert ? styles.actionDisabled : null]}>
                  <Ionicons name="return-up-back-outline" color={onPreviewRevert ? actionIconColor : disabledIconColor} size={15} />
                </Pressable>
              ) : (
                <Text style={[styles.pendingText, pendingStyle]}>pending</Text>
              )}
            </View>
            {expanded && file ? (
              <View style={styles.inlineReview}>
                <CollapsibleCodeBlock key={file.path} language={languageForFile(file, change.file)} filename={file.path || change.file} code={file.body || "(empty file)"} streaming={false} initialExpanded />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function ChangeCounts({ additions, deletions, compact = false }: { additions: number; deletions: number; compact?: boolean }) {
  const addColor = useThemedColor("#4EC07A");
  const deleteColor = useThemedColor("#F26A6A");
  const slashColor = useThemedColor("#7F798F");
  return (
    <View style={[styles.counts, compact ? styles.countsCompact : null]}>
      <Text style={[styles.countAdd, { color: addColor }, compact ? styles.countCompactText : null]}>+{additions}</Text>
      <Text style={[styles.countSlash, { color: slashColor }, compact ? styles.countCompactText : null]}>/</Text>
      <Text style={[styles.countDelete, { color: deleteColor }, compact ? styles.countCompactText : null]}>-{deletions}</Text>
    </View>
  );
}

function fileName(path: string) {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? path;
}

function sameFile(file: FileEntry, change: CodeChange) {
  return file.path === change.file || file.name === fileName(change.file) || change.file.endsWith(`/${file.path}`);
}

function languageForFile(file: FileEntry, path: string) {
  const explicit = file.language?.trim();
  if (explicit && explicit !== "text") return explicit;
  return extensionFor(path || file.path || file.name);
}

function extensionFor(path: string) {
  const clean = path.split(/[?#]/)[0].replace(/\\/g, "/");
  const name = clean.split("/").pop() ?? clean;
  return name.includes(".") ? name.split(".").pop()?.toLowerCase() ?? "" : "";
}

const styles = StyleSheet.create({
  actionButton: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.1)", borderRadius: 8, borderWidth: 1, justifyContent: "center", minHeight: 30, paddingHorizontal: 10 },
  actionButtonActive: { backgroundColor: "rgba(142, 60, 255, 0.2)", borderColor: "rgba(176, 132, 255, 0.34)" },
  actionDisabled: { opacity: 0.45 },
  actionPressed: { transform: [{ scale: 0.98 }] },
  actionText: { color: "#F2EEFF", fontSize: 12, fontWeight: "800" },
  card: { backgroundColor: "rgba(15, 17, 26, 0.92)", borderColor: "rgba(176, 132, 255, 0.24)", borderRadius: 14, borderWidth: 1, gap: 12, marginTop: 8, paddingHorizontal: 12, paddingVertical: 12 },
  changeGroup: { gap: 8 },
  countAdd: { color: "#4EC07A", fontSize: 12, fontWeight: "900" },
  countCompactText: { fontSize: 11 },
  countDelete: { color: "#F26A6A", fontSize: 12, fontWeight: "900" },
  countSlash: { color: "#7F798F", fontSize: 12, fontWeight: "800" },
  counts: { alignItems: "center", flexDirection: "row", gap: 4 },
  countsCompact: { gap: 3 },
  fileIcon: { alignItems: "center", backgroundColor: "rgba(191, 174, 255, 0.11)", borderRadius: 8, height: 30, justifyContent: "center", width: 30 },
  fileMain: { flex: 1, minWidth: 0 },
  fileName: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  fileStatsRow: { alignItems: "center", flexDirection: "row", gap: 7, marginTop: 2 },
  header: { alignItems: "center", flexDirection: "row", gap: 12 },
  headerBody: { flex: 1, minWidth: 0 },
  headerIcon: { alignItems: "center", borderRadius: 12, height: 42, justifyContent: "center", width: 42 },
  inlineReview: { marginTop: 2 },
  kicker: { color: "#B49CFF", fontSize: 11, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" },
  row: { alignItems: "center", flexDirection: "row", gap: 8 },
  pendingText: { color: "#A29CB8", fontSize: 11, fontWeight: "800" },
  previewRevertButton: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.1)", borderRadius: 8, borderWidth: 1, height: 30, justifyContent: "center", width: 32 },
  revertButton: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.1)", borderRadius: 8, borderWidth: 1, flexDirection: "row", gap: 4, height: 30, justifyContent: "center", paddingHorizontal: 8 },
  revertText: { color: "#F3EEFF", fontSize: 11.5, fontWeight: "800" },
  revertTextDisabled: { color: "#777186" },
  title: { color: "#FFFFFF", fontSize: 15, fontWeight: "900", marginTop: 2 },
  undoneText: { color: "#FFD166", fontSize: 11, fontWeight: "800" }
});
