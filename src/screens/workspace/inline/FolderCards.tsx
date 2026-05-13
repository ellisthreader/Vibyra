import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../../styles/theme";
import type { ChatMessage, Project } from "../../../types/domain";

export function FolderProposalCard({ proposal, onAccept, onDismiss, onWrong }: {
  proposal: NonNullable<ChatMessage["folderProposal"]>;
  onAccept?: (proposalId: string, folder: Project) => void;
  onDismiss?: (proposalId: string) => void;
  onWrong?: (proposalId: string, folder: Project, query: string) => void;
}) {
  const folder = proposal.matches[proposal.selectedIndex] ?? proposal.matches[0];
  if (!folder) return null;
  const resolved = proposal.status !== "pending";
  const query = proposal.query ?? folder.name;

  return (
    <View style={styles.card}>
      <View style={styles.kickerRow}>
        <View style={styles.kickerPill}>
          <Ionicons name="sparkles-outline" color="#D7C4FF" size={12} />
          <Text style={styles.kickerText}>Desktop match</Text>
        </View>
        <Text style={styles.matchCount}>{proposal.matches.length > 1 ? `${proposal.selectedIndex + 1} of ${proposal.matches.length}` : "Best match"}</Text>
      </View>
      <FolderHeader folder={folder} />
      {proposal.error ? <StatusBox text={proposal.error} /> : null}
      {resolved ? (
        <Text style={styles.status}>{proposal.status === "accepted" ? `Opened ${folder.name}` : "Dismissed"}</Text>
      ) : (
        <View style={styles.actions}>
          <CardButton icon="help-circle-outline" text="Wrong folder" tone="ghost" onPress={() => onWrong?.(proposal.id, folder, query)} />
          <CardButton text="Not now" tone="quiet" onPress={() => onDismiss?.(proposal.id)} />
          <CardButton icon="arrow-forward" text="Open folder" tone="primary" onPress={() => onAccept?.(proposal.id, folder)} />
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
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconSmall}>
          <Ionicons name="search-outline" color="#B084FF" size={16} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.recoveryTitle}>Find the right folder</Text>
          <Text style={styles.recoverySubtitle}>Choose how Vibyra should search your PC.</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <CardButton icon="folder-open-outline" text="Browse PC" tone="ghost" onPress={() => onBrowse?.(recovery)} />
        <CardButton icon="sparkles-outline" text="Auto search PC" tone="primary" onPress={() => onSearch?.(recovery.proposalId, recovery.query, recovery.excludedProjectId)} />
      </View>
    </View>
  );
}

function FolderHeader({ folder }: { folder: Project }) {
  return (
    <>
      <View style={styles.header}>
        <View style={styles.icon}><Ionicons name="folder-open-outline" color="#B084FF" size={18} /></View>
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={styles.name}>{folder.name}</Text>
          <Text numberOfLines={1} style={styles.path}>{folder.path}</Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        <Meta icon="cube-outline" text={folder.stack || "Project"} />
        <Meta icon="desktop-outline" text="PC" />
      </View>
    </>
  );
}

function Meta({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return <View style={styles.metaChip}><Ionicons name={icon} color="#B084FF" size={12} /><Text numberOfLines={1} style={styles.metaText}>{text}</Text></View>;
}

function StatusBox({ text }: { text: string }) {
  return <View style={styles.errorBox}><Ionicons name="alert-circle-outline" color="#FFD166" size={14} /><Text style={styles.errorText}>{text}</Text></View>;
}

function CardButton({ icon, text, tone, onPress }: { icon?: keyof typeof Ionicons.glyphMap; text: string; tone: "ghost" | "quiet" | "primary"; onPress: () => void }) {
  const textStyle = tone === "primary" ? styles.buttonPrimaryText : tone === "quiet" ? styles.buttonQuietText : styles.buttonGhostText;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.button, styles[`button${capitalize(tone)}`], pressed && styles.buttonPressed]}>
      {icon ? <Ionicons name={icon} color={tone === "primary" ? "#FFFFFF" : "#D5D0E6"} size={13} /> : null}
      <Text style={textStyle}>{text}</Text>
    </Pressable>
  );
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}` as "Ghost" | "Quiet" | "Primary";
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" },
  button: { alignItems: "center", borderRadius: 999, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 36, paddingHorizontal: 12, paddingVertical: 9 },
  buttonGhost: { borderColor: "rgba(255,255,255,0.14)", borderWidth: 1 },
  buttonGhostText: { color: "#D5D0E6", fontSize: 13, fontWeight: "700" },
  buttonPressed: { opacity: 0.85 },
  buttonPrimary: { backgroundColor: "#8E3CFF" },
  buttonPrimaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  buttonQuiet: { backgroundColor: "rgba(255,255,255,0.06)" },
  buttonQuietText: { color: "#A29CB8", fontSize: 13, fontWeight: "700" },
  card: { backgroundColor: "rgba(15, 17, 26, 0.92)", borderColor: "rgba(176, 132, 255, 0.24)", borderRadius: 14, borderWidth: 1, gap: 10, marginTop: 10, padding: 14 },
  errorBox: { alignItems: "center", backgroundColor: "rgba(255, 209, 102, 0.09)", borderColor: "rgba(255, 209, 102, 0.22)", borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: 7, padding: 9 },
  errorText: { color: "#FFE1A3", flex: 1, fontSize: 12, fontWeight: "700", lineHeight: 16 },
  header: { alignItems: "center", flexDirection: "row", gap: 10 },
  headerText: { flex: 1, minWidth: 0 },
  icon: { alignItems: "center", backgroundColor: "rgba(176, 132, 255, 0.18)", borderRadius: 12, height: 40, justifyContent: "center", width: 40 },
  iconSmall: { alignItems: "center", backgroundColor: "rgba(176, 132, 255, 0.15)", borderRadius: 10, height: 34, justifyContent: "center", width: 34 },
  kickerPill: { alignItems: "center", backgroundColor: "rgba(142, 60, 255, 0.18)", borderColor: "rgba(176, 132, 255, 0.24)", borderRadius: 999, borderWidth: 1, flexDirection: "row", gap: 5, paddingHorizontal: 9, paddingVertical: 5 },
  kickerRow: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  kickerText: { color: "#D7C4FF", fontSize: 11, fontWeight: "800" },
  matchCount: { color: "#8F8A9E", fontSize: 11, fontWeight: "700" },
  metaChip: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.08)", borderRadius: 999, borderWidth: 1, flexDirection: "row", gap: 5, minHeight: 26, paddingHorizontal: 9 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metaText: { color: "#D5D0E6", fontSize: 11, fontWeight: "800", maxWidth: 150 },
  name: { color: colors.text, fontSize: 16, fontWeight: "900" },
  path: { color: "#A29CB8", fontSize: 12, marginTop: 2 },
  recoverySubtitle: { color: "#A29CB8", fontSize: 12, fontWeight: "700", marginTop: 2 },
  recoveryTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  status: { color: "#A29CB8", fontSize: 12, fontStyle: "italic" }
});
