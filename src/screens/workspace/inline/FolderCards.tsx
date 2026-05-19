import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ChatMessage, Project } from "../../../types/domain";
import { useChatActionCardPalette } from "./chatActionCardTheme";

type Palette = ReturnType<typeof useChatActionCardPalette>;

export function FolderProposalCard({ proposal, onAccept, onDismiss, onWrong }: {
  proposal: NonNullable<ChatMessage["folderProposal"]>;
  onAccept?: (proposalId: string, folder: Project) => void;
  onDismiss?: (proposalId: string) => void;
  onWrong?: (proposalId: string, folder: Project, query: string) => void;
}) {
  const palette = useChatActionCardPalette();
  const folder = proposal.matches[proposal.selectedIndex] ?? proposal.matches[0];
  if (!folder) return null;
  const resolved = proposal.status !== "pending";
  const query = proposal.query ?? folder.name;

  return (
    <View style={[styles.card, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
      <View style={styles.topRow}>
        <View style={styles.statusLabel}>
          <Ionicons name="folder-open-outline" color={palette.iconColor} size={15} />
          <Text style={[styles.statusText, { color: palette.kicker }]}>Found folder</Text>
        </View>
        <Text style={[styles.matchCount, { color: palette.muted }]}>
          {proposal.matches.length > 1 ? `${proposal.selectedIndex + 1} of ${proposal.matches.length}` : "Best match"}
        </Text>
      </View>

      <FolderSummary folder={folder} palette={palette} />
      {proposal.error ? <StatusBox palette={palette} text={proposal.error} /> : null}

      {resolved ? (
        <Text style={[styles.resolvedText, { color: palette.muted }]}>{proposal.status === "accepted" ? `Opened ${folder.name}` : "Dismissed"}</Text>
      ) : (
        <View style={styles.actionStack}>
          <ActionButton icon="arrow-forward" palette={palette} text="Open folder" tone="primary" onPress={() => onAccept?.(proposal.id, folder)} />
          <View style={styles.secondaryActions}>
            <TextAction palette={palette} text="Wrong folder" onPress={() => onWrong?.(proposal.id, folder, query)} />
            <TextAction muted palette={palette} text="Not now" onPress={() => onDismiss?.(proposal.id)} />
          </View>
        </View>
      )}
    </View>
  );
}

export function FolderRecoveryCard({ recovery, onBrowse, onSearch }: {
  recovery: NonNullable<ChatMessage["folderRecovery"]>;
  onBrowse?: (recovery: NonNullable<ChatMessage["folderRecovery"]>) => void;
  onSearch?: (proposalId: string, query: string, excludeProjectId?: string) => void;
}) {
  const palette = useChatActionCardPalette();
  return (
    <View style={[styles.card, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
      <View style={styles.topRow}>
        <View style={styles.statusLabel}>
          <Ionicons name="search-outline" color={palette.iconColor} size={15} />
          <Text style={[styles.statusText, { color: palette.kicker }]}>Find the right folder</Text>
        </View>
      </View>
      <Text style={[styles.recoveryCopy, { color: palette.body }]}>Search again, or browse your PC manually.</Text>
      <View style={styles.actionStack}>
        <ActionButton icon="sparkles-outline" palette={palette} text="Auto search PC" tone="primary" onPress={() => onSearch?.(recovery.proposalId, recovery.query, recovery.excludedProjectId)} />
        <ActionButton icon="folder-open-outline" palette={palette} text="Browse PC" tone="ghost" onPress={() => onBrowse?.(recovery)} />
      </View>
    </View>
  );
}

function FolderSummary({ folder, palette }: { folder: Project; palette: Palette }) {
  const stack = folder.stack?.trim();
  return (
    <View style={styles.folderRow}>
      <View style={[styles.folderIcon, { backgroundColor: palette.iconBg }]}>
        <Ionicons name="folder" color={palette.iconColor} size={18} />
      </View>
      <View style={styles.folderCopy}>
        <Text numberOfLines={1} style={[styles.folderName, { color: palette.text }]}>{folder.name}</Text>
        <Text numberOfLines={1} style={[styles.folderPath, { color: palette.body }]}>{shortPath(folder.path)}</Text>
        <Text numberOfLines={1} style={[styles.folderMeta, { color: palette.muted }]}>{stack ? `${stack} on PC` : "Project on PC"}</Text>
      </View>
    </View>
  );
}

function StatusBox({ palette, text }: { palette: Palette; text: string }) {
  return (
    <View style={[styles.errorBox, { backgroundColor: palette.errorBg, borderColor: palette.errorBorder }]}>
      <Ionicons name="alert-circle-outline" color={palette.errorText} size={14} />
      <Text style={[styles.errorText, { color: palette.errorText }]}>{text}</Text>
    </View>
  );
}

function ActionButton({ icon, palette, text, tone, onPress }: {
  icon?: keyof typeof Ionicons.glyphMap;
  palette: Palette;
  text: string;
  tone: "ghost" | "primary";
  onPress: () => void;
}) {
  const primary = tone === "primary";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        primary
          ? { backgroundColor: palette.buttonPrimary }
          : { backgroundColor: palette.buttonGhostBg, borderColor: palette.buttonGhostBorder, borderWidth: 1 },
        pressed && styles.pressed
      ]}
    >
      {icon ? <Ionicons name={icon} color={primary ? palette.primaryText : palette.buttonGhostText} size={14} /> : null}
      <Text style={[styles.actionText, { color: primary ? palette.primaryText : palette.buttonGhostText }]}>{text}</Text>
    </Pressable>
  );
}

function TextAction({ muted, palette, text, onPress }: {
  muted?: boolean;
  palette: Palette;
  text: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}>
      <Text style={[styles.textActionLabel, { color: muted ? palette.muted : palette.buttonGhostText }]}>{text}</Text>
    </Pressable>
  );
}

function shortPath(path?: string) {
  if (!path) return "Desktop folder";
  const normalized = path.replace(/\\/g, "/").replace(/^~\//, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 2) return normalized;
  return `.../${parts.slice(-2).join("/")}`;
}

const styles = StyleSheet.create({
  actionButton: { alignItems: "center", borderRadius: 999, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 40, paddingHorizontal: 14 },
  actionStack: { gap: 7, marginTop: 1 },
  actionText: { fontSize: 13, fontWeight: "800" },
  card: { borderRadius: 14, borderWidth: 1, gap: 10, marginTop: 10, padding: 14 },
  errorBox: { alignItems: "center", borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: 7, padding: 9 },
  errorText: { flex: 1, fontSize: 12, fontWeight: "700", lineHeight: 16 },
  folderCopy: { flex: 1, minWidth: 0 },
  folderIcon: { alignItems: "center", borderRadius: 12, height: 38, justifyContent: "center", width: 38 },
  folderMeta: { fontSize: 11, fontWeight: "700", marginTop: 4 },
  folderName: { fontSize: 16, fontWeight: "900", lineHeight: 21 },
  folderPath: { fontSize: 12, fontWeight: "600", marginTop: 1 },
  folderRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  matchCount: { fontSize: 11, fontWeight: "700" },
  pressed: { opacity: 0.84 },
  recoveryCopy: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  resolvedText: { fontSize: 12, fontWeight: "700" },
  secondaryActions: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "center" },
  statusLabel: { alignItems: "center", flexDirection: "row", gap: 6 },
  statusText: { fontSize: 11, fontWeight: "800" },
  textAction: { alignItems: "center", borderRadius: 999, flex: 1, justifyContent: "center", minHeight: 34, paddingHorizontal: 10 },
  textActionLabel: { fontSize: 12, fontWeight: "800" },
  topRow: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "space-between" }
});
