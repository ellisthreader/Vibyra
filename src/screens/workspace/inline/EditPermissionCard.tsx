import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, Text, View } from "react-native";
import { editPermissionStyles as styles } from "./EditPermissionCard.styles";
import { Ionicons } from "@expo/vector-icons";
import type { CodeChange, FileEntry } from "../../../types/domain";
import { CollapsibleCodeBlock } from "./CollapsibleCodeBlock";
import { useChatActionCardPalette } from "./chatActionCardTheme";

export function EditPermissionCard({ changes, files, projectName, busy, onAllow, onAllowAlways, onDeny }: {
  changes: CodeChange[];
  files: FileEntry[];
  projectName?: string;
  busy?: boolean;
  onAllow: () => void;
  onAllowAlways: () => void;
  onDeny: () => void;
}) {
  const palette = useChatActionCardPalette();
  const [expandedPath, setExpandedPath] = useState("");
  const opacity = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(lift, { toValue: 0, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" })
    ]).start();
  }, [opacity, lift]);

  const visible = changes.filter((c) => !c.file.includes(".vibyra-agent/runs/"));
  return (
    <Animated.View style={[styles.card, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder, opacity, transform: [{ translateY: lift }] }]}>
      <View style={styles.kickerRow}>
        <View style={[styles.kickerPill, { backgroundColor: palette.kickerBg, borderColor: palette.kickerBorder }]}>
          <Ionicons name="lock-closed-outline" color={palette.kicker} size={12} />
          <Text style={[styles.kicker, { color: palette.kicker }]}>Permission required</Text>
        </View>
        <Text style={[styles.fileCount, { color: palette.muted }]}>
          {visible.length} file{visible.length === 1 ? "" : "s"}
        </Text>
      </View>

      <View style={styles.headerText}>
        <Text style={[styles.title, { color: palette.text }]}>Review edits before applying</Text>
        <Text style={[styles.subtitle, { color: palette.body }]}>
          Vibyra wants to update {visible.length} file{visible.length === 1 ? "" : "s"}
          {projectName ? ` in ${projectName}` : ""}. You can inspect the code first.
        </Text>
      </View>

      <View style={styles.fileList}>
        {visible.map((change) => {
          const file = files.find((item) => sameFile(item, change));
          const expanded = Boolean(file && expandedPath === file.path);
          return (
            <View key={change.id} style={[styles.fileGroup, { backgroundColor: palette.panelBg, borderColor: palette.panelBorder }]}>
              <View style={styles.fileRow}>
                <View style={[styles.fileIcon, { backgroundColor: palette.iconBg }]}>
                  <Ionicons name={expanded ? "code-slash-outline" : "document-text-outline"} color={palette.iconColor} size={13} />
                </View>
                <Text numberOfLines={1} style={[styles.filePath, { color: palette.text }]}>
                  {fileName(change.file)}
                </Text>
                <Pressable
                  disabled={!file}
                  onPress={() => file && setExpandedPath(expanded ? "" : file.path)}
                  style={({ pressed }) => [
                    styles.reviewButton,
                    { backgroundColor: expanded ? palette.buttonQuietBg : palette.buttonGhostBg, borderColor: palette.buttonGhostBorder },
                    pressed && file ? styles.btnPressed : null,
                    !file ? styles.btnDisabled : null
                  ]}
                >
                  <Text style={[styles.reviewButtonText, { color: palette.buttonGhostText }]}>{expanded ? "Hide" : "Review"}</Text>
                </Pressable>
              </View>
              {expanded && file ? (
                <View style={styles.inlineReview}>
                  <CollapsibleCodeBlock
                    code={file.body || "(empty file)"}
                    filename={file.path || change.file}
                    initialExpanded
                    language={languageForFile(file, change.file)}
                    streaming={false}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="Deny edits"
          disabled={busy}
          onPress={onDeny}
          style={({ pressed }) => [styles.btn, styles.btnGhost, { backgroundColor: palette.buttonGhostBg, borderColor: palette.buttonGhostBorder }, pressed && styles.btnPressed, busy && styles.btnDisabled]}
        >
          <Text style={[styles.btnGhostText, { color: palette.buttonGhostText }]}>No</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Allow these edits once"
          disabled={busy}
          onPress={onAllow}
          style={({ pressed }) => [styles.btn, styles.btnPrimary, { backgroundColor: palette.buttonPrimary }, pressed && styles.btnPressed, busy && styles.btnDisabled]}
        >
          <Text style={styles.btnAllowText}>Allow</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Always allow edits in this project"
          disabled={busy}
          onPress={onAllowAlways}
          style={({ pressed }) => [styles.btn, styles.btnAlways, styles.btnGhost, { backgroundColor: palette.buttonQuietBg, borderColor: palette.buttonGhostBorder }, pressed && styles.btnPressed, busy && styles.btnDisabled]}
        >
          <Text style={[styles.btnGhostText, { color: palette.buttonGhostText }]}>Always allow</Text>
        </Pressable>
      </View>
    </Animated.View>
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
