import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePreferences, useThemedColor } from "../../../context/PreferencesContext";
import { styles } from "../styles";
import type { DashboardPage } from "../types";
import { AccountAvatar } from "./AccountAvatar";
import { SidePanel } from "./SidePanel";
import { WorkspaceMenuRow, type MenuRow } from "./WorkspaceMenuRow";

export function PrimaryMenuSheet({
  accountName,
  activePage,
  connected,
  machineName,
  onClose,
  onConnectPc,
  onNavigate,
  onNewChat,
  onOpenAccountMenu,
  onOpenProfile,
  onOpenRecentChat,
  onRenameChat,
  profileImageUri,
  projectCount,
  recentChats,
  selectedChatId,
  visible
}: {
  accountName: string;
  activePage: DashboardPage;
  connected: boolean;
  machineName: string;
  onClose: () => void;
  onConnectPc: () => void;
  onNavigate: (page: DashboardPage) => void;
  onNewChat: () => void;
  onOpenAccountMenu: () => void;
  onOpenProfile: () => void;
  onOpenRecentChat: (chatId: string) => void;
  onRenameChat?: () => void;
  profileImageUri: string;
  projectCount: number;
  recentChats: Array<{ id: string; title: string }>;
  selectedChatId: string | null;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const prefs = usePreferences();
  const chevronColor = useThemedColor("#8F94A3");
  const pcIconColor = useThemedColor("#D5D9E4");
  const atmosphereColors = prefs.effectiveScheme === "light"
    ? ["rgba(109, 59, 255, 0.09)", "rgba(109, 59, 255, 0.025)", "rgba(109, 59, 255, 0)"] as const
    : ["rgba(109, 59, 255, 0.16)", "rgba(109, 59, 255, 0.045)", "rgba(109, 59, 255, 0)"] as const;
  const activeRecent = recentChats.some((chat) => chat.id === selectedChatId);
  const rows: MenuRow[] = [
    { icon: "create-outline", label: "New chat", onPress: onNewChat, active: activePage === "chat" && !activeRecent },
    { icon: "folder-open-outline", label: "Projects", meta: `${projectCount}`, onPress: () => onNavigate("projects"), active: activePage === "projects" },
    { icon: "compass-outline", label: "Explore", onPress: () => onNavigate("community"), active: activePage === "community" },
    { icon: "person-circle-outline", label: "Account", onPress: onOpenProfile, active: activePage === "profile" }
  ];

  return (
    <SidePanel side="left" visible={visible} onClose={onClose}>
      <View style={[styles.menuPage, { paddingTop: Math.max(insets.top + 16, 20) }]}>
        <LinearGradient
          colors={atmosphereColors}
          end={{ x: 0.76, y: 1 }}
          pointerEvents="none"
          start={{ x: 0.18, y: 0 }}
          style={styles.workspaceMenuAtmosphere}
        />
        <View style={styles.workspaceMenuHeader}>
          <Text style={styles.workspaceMenuTitle}>Vibyra</Text>
          <Pressable
            accessibilityLabel="Open profile"
            onPress={onOpenAccountMenu}
            style={({ pressed }) => [styles.menuHeaderAvatar, pressed ? styles.menuHeaderAvatarPressed : null]}
          >
            <AccountAvatar imageUri={profileImageUri} name={accountName} size={30} textSize={13} />
          </Pressable>
        </View>

        <ScrollView style={styles.menuPageScroll} contentContainerStyle={styles.menuPageScrollContent} showsVerticalScrollIndicator={false}>
          <Pressable style={styles.workspaceConnectionRow} onPress={onConnectPc}>
            <View style={styles.workspaceConnectionIconTile}>
              <Ionicons name="desktop-outline" color={pcIconColor} size={19} />
              <View style={[styles.workspaceConnectionStatusBadge, connected ? null : styles.workspaceConnectionStatusBadgeOffline]} />
            </View>
            <View style={styles.workspaceConnectionCopy}>
              <Text style={[styles.workspaceConnectionLabel, connected ? styles.workspaceConnectionLabelOnline : null]}>
                {connected ? "Connected PC" : "Not connected"}
              </Text>
              <Text numberOfLines={1} style={styles.workspaceConnectionName}>{machineName}</Text>
            </View>
            <Ionicons name="chevron-forward" color={chevronColor} size={18} />
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
                    row={{ label: chat.title, onPress: () => onOpenRecentChat(chat.id), active: chat.id === selectedChatId }}
                  />
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      </View>
    </SidePanel>
  );
}
