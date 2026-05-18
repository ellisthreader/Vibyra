import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemedColor } from "../../../context/PreferencesContext";
import { styles } from "../styles";
import type { DashboardPage, SettingsTab } from "../types";
import { AccountAvatar } from "./AccountAvatar";

type IconName = keyof typeof Ionicons.glyphMap;

type MenuRow = {
  icon?: IconName;
  label: string;
  meta?: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
};

export function PrimaryMenuSheet({
  activeBuildCount,
  activePage,
  connected,
  machineName,
  onClose,
  onConnectPc,
  onNavigate,
  onNewChat,
  onOpenAccount,
  onOpenRecentChat,
  onRenameChat,
  projectCount,
  recentChats,
  visible
}: {
  activeBuildCount: number;
  activePage: DashboardPage;
  connected: boolean;
  machineName: string;
  onClose: () => void;
  onConnectPc: () => void;
  onNavigate: (page: DashboardPage) => void;
  onNewChat: () => void;
  onOpenAccount: () => void;
  onOpenRecentChat: (chatId: string) => void;
  onRenameChat?: () => void;
  projectCount: number;
  recentChats: Array<{ id: string; title: string }>;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const rows: MenuRow[] = [
    { icon: "create-outline", label: "New chat", onPress: onNewChat, active: activePage === "chat" },
    { icon: "folder-open-outline", label: "Projects", meta: `${projectCount}`, onPress: () => onNavigate("projects"), active: activePage === "projects" },
    { icon: "pulse-outline", label: "Active builds", meta: `${activeBuildCount}`, onPress: () => onNavigate("dashboard"), active: activePage === "dashboard" },
    { icon: "compass-outline", label: "Explore", onPress: () => onNavigate("community"), active: activePage === "community" },
    { icon: "person-circle-outline", label: "Account", onPress: onOpenAccount, active: activePage === "profile" }
  ];

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.workspaceMenuOverlay}>
        <Pressable accessibilityLabel="Close menu" style={styles.workspaceMenuScrim} onPress={onClose} />
        <View style={[styles.workspaceMenuPanel, { paddingTop: Math.max(insets.top + 16, 18) }]}>
          <View style={styles.workspaceMenuHeader}>
            <View>
              <Text style={styles.workspaceMenuTitle}>Vibyra</Text>
            </View>
            <Pressable accessibilityLabel="Close menu" style={styles.workspaceMenuIconButton} onPress={onClose}>
              <Ionicons name="close" color="#F6F2FF" size={20} />
            </Pressable>
          </View>

          <Pressable style={styles.workspaceConnectionRow} onPress={onConnectPc}>
            <View style={[styles.workspaceConnectionDot, connected ? null : styles.workspaceConnectionDotOffline]} />
            <View style={styles.workspaceConnectionCopy}>
              <Text style={styles.workspaceConnectionLabel}>{connected ? "Connected" : "Not connected"}</Text>
              <Text numberOfLines={1} style={styles.workspaceConnectionName}>{machineName}</Text>
            </View>
            <Ionicons name="chevron-forward" color="#AFA7C2" size={18} />
          </Pressable>

          <View style={styles.workspaceMenuList}>
            {rows.map((row) => <WorkspaceMenuRow key={row.label} row={row} />)}
          </View>

          {recentChats.length > 0 ? (
            <>
              <View style={styles.workspaceMenuDivider} />
              <Text style={styles.workspaceMenuSectionLabel}>Recent chats</Text>
              <View style={styles.workspaceMenuList}>
                {recentChats.map((chat) => (
                  <WorkspaceMenuRow
                    key={chat.id}
                    row={{ label: chat.title, onPress: () => onOpenRecentChat(chat.id) }}
                  />
                ))}
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

export function AccountMenuSheet({
  name,
  onClose,
  onOpenTokens,
  onTab,
  plan,
  profileImageUri,
  tokenBalance,
  visible
}: {
  name: string;
  onClose: () => void;
  onOpenTokens: () => void;
  onTab: (tab: SettingsTab) => void;
  plan: string;
  profileImageUri: string;
  tokenBalance: number;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const rows: MenuRow[] = [
    { icon: "person-outline", label: "Profile", onPress: () => onTab("profile") },
    { icon: "card-outline", label: "Billing", meta: plan, onPress: () => onTab("billing") },
    { icon: "color-palette-outline", label: "Appearance", onPress: () => onTab("preferences") },
    { icon: "shield-outline", label: "Security", onPress: () => onTab("security") },
    { icon: "flash-outline", label: "Credits", meta: tokenBalance.toLocaleString(), onPress: onOpenTokens }
  ];

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.accountMenuOverlay}>
        <Pressable accessibilityLabel="Close account menu" style={styles.workspaceMenuScrim} onPress={onClose} />
        <View style={[styles.accountMenuPanel, { marginTop: Math.max(insets.top + 8, 12) }]}>
          <View style={styles.accountMenuHeader}>
            <View style={styles.accountAvatarLarge}>
              <AccountAvatar imageUri={profileImageUri} name={name} size={52} textSize={21} />
            </View>
            <View style={styles.accountMenuCopy}>
              <Text numberOfLines={1} style={styles.accountMenuName}>{name.trim() || "Account"}</Text>
              <Text style={styles.accountMenuPlan}>{plan}</Text>
            </View>
          </View>
          <View style={styles.workspaceMenuList}>
            {rows.map((row) => <WorkspaceMenuRow key={row.label} row={row} />)}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function WorkspaceMenuRow({ row }: { row: MenuRow }) {
  const iconColor = useThemedColor(row.danger ? "#FF9DAE" : row.active ? "#FFFFFF" : "#D5CEE4");
  return (
    <Pressable
      onPress={row.onPress}
      style={({ pressed }) => [
        styles.workspaceMenuRow,
        row.active ? styles.workspaceMenuRowActive : null,
        row.danger ? styles.workspaceMenuRowDanger : null,
        pressed ? styles.workspaceMenuRowPressed : null
      ]}
    >
      {row.icon ? (
        <View style={[styles.workspaceMenuRowIcon, row.active ? styles.workspaceMenuRowIconActive : null]}>
          <Ionicons name={row.icon} color={iconColor} size={20} />
        </View>
      ) : null}
      <Text numberOfLines={1} style={[styles.workspaceMenuRowLabel, row.danger ? styles.workspaceMenuRowLabelDanger : null]}>{row.label}</Text>
      {row.meta ? <Text numberOfLines={1} style={styles.workspaceMenuRowMeta}>{row.meta}</Text> : null}
    </Pressable>
  );
}
