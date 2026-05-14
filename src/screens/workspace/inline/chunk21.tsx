import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Image, ImageBackground, KeyboardAvoidingView, Linking, Modal,
  NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View
} from "react-native";
import type { ImageStyle, StyleProp, TextStyle, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from "react-native-svg";
import { AppWebView } from "../../../components/AppWebView";
import { VibyraLogo } from "../../../components/VibyraLogo";
import { colors } from "../../../styles/theme";
import { useThemedColor } from "../../../context/PreferencesContext";
import type { Agent, ChatMessage, GeneratedApp, ModelKey, Project, RememberedDesktop } from "../../../types/domain";
import { appApiRequest } from "../../../utils/appApi";
import { fetchWithTimeout, normalizeAgentUrl } from "../../../utils/network";
import { aiChatGlyph, chatBuildAiHero, communityHero, dashboardHeroArt, projectsBackdrop, projectsFoldersHero, vibyraLogo } from "../data/assets";
import { chatModelGroups, chatModelOptions, providerLogoSources } from "../data/chatModels";
import { COMMUNITY_COMMENTS_KEY, communityDetailAccent, communityDetailAccentDark, communityPosts } from "../data/community";
import { chatSuggestions, pages, previousChats, projectFilterModes, projectStatuses, tokenMembership } from "../data/pages";
import { styles } from "../styles";
import type { ChatModelOption, ChatModelProvider, CommunityComment, CommunityDetailTab, CommunityFilter, CommunityLogoKind, CommunityPost, CommunityPreviewKind, DashboardPage, DesktopCandidate, ProjectDisplay, ProjectLayout, SettingsTab } from "../types";

export function ProjectMenuItem({ danger, icon, label, onPress }: {
  danger?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const itemIconColor = useThemedColor(danger ? "#FF7F96" : "#E8E1FF");
  return (
    <Pressable style={({ pressed }) => [styles.projectMenuItem, pressed ? styles.projectMenuItemPressed : null]} onPress={onPress}>
      <Ionicons name={icon} color={itemIconColor} size={17} />
      <Text style={[styles.projectMenuItemText, danger ? styles.projectMenuItemTextDanger : null]}>{label}</Text>
    </Pressable>
  );
}

export function ProjectFilterMenuItem({ active, label, onPress }: {
  active: boolean;
  label: typeof projectFilterModes[number];
  onPress: () => void;
}) {
  const checkColor = useThemedColor("#E8E1FF");
  return (
    <Pressable style={({ pressed }) => [styles.projectsFilterMenuItem, active ? styles.projectsFilterMenuItemActive : null, pressed ? styles.projectsFilterMenuItemPressed : null]} onPress={onPress}>
      <Text style={[styles.projectsFilterMenuText, active ? styles.projectsFilterMenuTextActive : null]}>{label}</Text>
      {active ? <Ionicons name="checkmark" color={checkColor} size={15} /> : null}
    </Pressable>
  );
}

export function FolderConfirmModal({ confirm, onAccept, onCancel, onSkip }: {
  confirm: { query: string; matches: Project[] } | null;
  onAccept: (folder: Project) => void | Promise<void>;
  onCancel: () => void;
  onSkip: () => void | Promise<void>;
}) {
  const modalIconColor = useThemedColor("#A88BFF");
  const folderIconColor = useThemedColor("#E8E1FF");
  const folderMetaColor = useThemedColor("#9892B5");
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={confirm !== null}>
      <View style={styles.projectDeleteOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.projectDeleteDialog}>
          <View style={styles.projectDeleteIcon}>
            <Ionicons name="folder-open-outline" color={modalIconColor} size={24} />
          </View>
          <Text style={styles.projectDeleteTitle}>Open this folder on your PC?</Text>
          <Text style={styles.projectDeleteBody}>
            Vibyra found these folders that match your request. Pick one to start coding in, or skip to keep using the current project.
          </Text>
          <View style={{ width: "100%", gap: 8, marginTop: 12 }}>
            {(confirm?.matches ?? []).slice(0, 5).map((folder) => (
              <Pressable
                key={folder.id}
                style={({ pressed }) => [styles.projectMenuItem, pressed ? styles.projectMenuItemPressed : null, { borderRadius: 12, paddingVertical: 12 }]}
                onPress={() => onAccept(folder)}
              >
                <Ionicons name="folder-outline" color={folderIconColor} size={18} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.projectMenuItemText}>{folder.name}</Text>
                  <Text numberOfLines={1} style={[styles.projectMenuItemText, { color: folderMetaColor, fontSize: 11, marginTop: 2 }]}>{folder.path}</Text>
                </View>
                <Ionicons name="chevron-forward" color={folderMetaColor} size={16} />
              </Pressable>
            ))}
          </View>
          <View style={styles.projectDeleteActions}>
            <Pressable style={styles.projectDeleteCancelButton} onPress={onCancel}>
              <Text style={styles.projectDeleteCancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.projectDeleteConfirmButton} onPress={() => { void onSkip(); }}>
              <Text style={styles.projectDeleteConfirmText}>Skip</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function ProjectDeleteConfirmModal({ onCancel, onConfirm, project }: {
  onCancel: () => void;
  onConfirm: () => void;
  project: ProjectDisplay | null;
}) {
  const deleteIconColor = useThemedColor("#FF8CA0");
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={project !== null}>
      <View style={styles.projectDeleteOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.projectDeleteDialog}>
          <View style={styles.projectDeleteIcon}>
            <Ionicons name="trash-outline" color={deleteIconColor} size={24} />
          </View>
          <Text style={styles.projectDeleteTitle}>Delete project?</Text>
          <Text style={styles.projectDeleteBody}>
            {project ? `This will remove ${project.name} from your project list.` : "This will remove this project from your project list."}
          </Text>
          <View style={styles.projectDeleteActions}>
            <Pressable style={styles.projectDeleteCancelButton} onPress={onCancel}>
              <Text style={styles.projectDeleteCancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.projectDeleteConfirmButton} onPress={onConfirm}>
              <Text style={styles.projectDeleteConfirmText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
