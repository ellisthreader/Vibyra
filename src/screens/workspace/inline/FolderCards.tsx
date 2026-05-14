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
      <View style={styles.kickerRow}>
        <View style={[styles.kickerPill, { backgroundColor: palette.kickerBg, borderColor: palette.kickerBorder }]}>
          <Ionicons name="sparkles-outline" color={palette.kicker} size={12} />
          <Text style={[styles.kickerText, { color: palette.kicker }]}>Desktop match</Text>
        </View>
        <Text style={[styles.matchCount, { color: palette.muted }]}>{proposal.matches.length > 1 ? `${proposal.selectedIndex + 1} of ${proposal.matches.length}` : "Best match"}</Text>
      </View>
      <FolderHeader folder={folder} palette={palette} />
      {proposal.error ? <StatusBox palette={palette} text={proposal.error} /> : null}
      {resolved ? (
        <Text style={[styles.status, { color: palette.muted }]}>{proposal.status === "accepted" ? `Opened ${folder.name}` : "Dismissed"}</Text>
      ) : (
        <View style={styles.actions}>
          <CardButton icon="help-circle-outline" palette={palette} text="Wrong folder" tone="ghost" onPress={() => onWrong?.(proposal.id, folder, query)} />
          <CardButton palette={palette} text="Not now" tone="quiet" onPress={() => onDismiss?.(proposal.id)} />
          <CardButton icon="arrow-forward" palette={palette} text="Open folder" tone="primary" onPress={() => onAccept?.(proposal.id, folder)} />
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
      <View style={styles.header}>
        <View style={[styles.iconSmall, { backgroundColor: palette.iconBg }]}>
          <Ionicons name="search-outline" color={palette.iconColor} size={16} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.recoveryTitle, { color: palette.text }]}>Find the right folder</Text>
          <Text style={[styles.recoverySubtitle, { color: palette.body }]}>Choose how Vibyra should search your PC.</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <CardButton icon="folder-open-outline" palette={palette} text="Browse PC" tone="ghost" onPress={() => onBrowse?.(recovery)} />
        <CardButton icon="sparkles-outline" palette={palette} text="Auto search PC" tone="primary" onPress={() => onSearch?.(recovery.proposalId, recovery.query, recovery.excludedProjectId)} />
      </View>
    </View>
  );
}

function FolderHeader({ folder, palette }: { folder: Project; palette: Palette }) {
  return (
    <>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: palette.iconBg }]}><Ionicons name="folder-open-outline" color={palette.iconColor} size={18} /></View>
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={[styles.name, { color: palette.text }]}>{folder.name}</Text>
          <Text numberOfLines={1} style={[styles.path, { color: palette.body }]}>{folder.path}</Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        <Meta icon="cube-outline" palette={palette} text={folder.stack || "Project"} />
        <Meta icon="desktop-outline" palette={palette} text="PC" />
      </View>
    </>
  );
}

function Meta({ icon, palette, text }: { icon: keyof typeof Ionicons.glyphMap; palette: Palette; text: string }) {
  return <View style={[styles.metaChip, { backgroundColor: palette.chipBg, borderColor: palette.chipBorder }]}><Ionicons name={icon} color={palette.iconColor} size={12} /><Text numberOfLines={1} style={[styles.metaText, { color: palette.buttonGhostText }]}>{text}</Text></View>;
}

function StatusBox({ palette, text }: { palette: Palette; text: string }) {
  return <View style={[styles.errorBox, { backgroundColor: palette.errorBg, borderColor: palette.errorBorder }]}><Ionicons name="alert-circle-outline" color={palette.errorText} size={14} /><Text style={[styles.errorText, { color: palette.errorText }]}>{text}</Text></View>;
}

function CardButton({ icon, palette, text, tone, onPress }: { icon?: keyof typeof Ionicons.glyphMap; palette: Palette; text: string; tone: "ghost" | "quiet" | "primary"; onPress: () => void }) {
  const primary = tone === "primary";
  const buttonStyle = primary
    ? { backgroundColor: palette.buttonPrimary }
    : tone === "quiet"
      ? { backgroundColor: palette.buttonQuietBg }
      : { backgroundColor: palette.buttonGhostBg, borderColor: palette.buttonGhostBorder, borderWidth: 1 };
  const textStyle = tone === "primary" ? styles.buttonPrimaryText : tone === "quiet" ? styles.buttonQuietText : styles.buttonGhostText;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.button, buttonStyle, pressed && styles.buttonPressed]}>
      {icon ? <Ionicons name={icon} color={primary ? palette.primaryText : palette.buttonGhostText} size={13} /> : null}
      <Text style={[textStyle, { color: primary ? palette.primaryText : tone === "quiet" ? palette.buttonQuietText : palette.buttonGhostText }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" },
  button: { alignItems: "center", borderRadius: 999, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 36, paddingHorizontal: 12, paddingVertical: 9 },
  buttonGhostText: { fontSize: 13, fontWeight: "700" },
  buttonPressed: { opacity: 0.85 },
  buttonPrimaryText: { fontSize: 13, fontWeight: "800" },
  buttonQuietText: { fontSize: 13, fontWeight: "700" },
  card: { borderRadius: 14, borderWidth: 1, gap: 10, marginTop: 10, padding: 14 },
  errorBox: { alignItems: "center", borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: 7, padding: 9 },
  errorText: { flex: 1, fontSize: 12, fontWeight: "700", lineHeight: 16 },
  header: { alignItems: "center", flexDirection: "row", gap: 10 },
  headerText: { flex: 1, minWidth: 0 },
  icon: { alignItems: "center", borderRadius: 12, height: 40, justifyContent: "center", width: 40 },
  iconSmall: { alignItems: "center", borderRadius: 10, height: 34, justifyContent: "center", width: 34 },
  kickerPill: { alignItems: "center", borderRadius: 999, borderWidth: 1, flexDirection: "row", gap: 5, paddingHorizontal: 9, paddingVertical: 5 },
  kickerRow: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  kickerText: { fontSize: 11, fontWeight: "800" },
  matchCount: { fontSize: 11, fontWeight: "700" },
  metaChip: { alignItems: "center", borderRadius: 999, borderWidth: 1, flexDirection: "row", gap: 5, minHeight: 26, paddingHorizontal: 9 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metaText: { fontSize: 11, fontWeight: "800", maxWidth: 150 },
  name: { fontSize: 16, fontWeight: "900" },
  path: { fontSize: 12, marginTop: 2 },
  recoverySubtitle: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  recoveryTitle: { fontSize: 15, fontWeight: "900" },
  status: { fontSize: 12, fontStyle: "italic" }
});
