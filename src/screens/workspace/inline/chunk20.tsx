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
import type { Agent, ChatMessage, GeneratedApp, ModelKey, Project, RememberedDesktop } from "../../../types/domain";
import { appApiRequest } from "../../../utils/appApi";
import { fetchWithTimeout, normalizeAgentUrl } from "../../../utils/network";
import { aiChatGlyph, chatBuildAiHero, communityHero, dashboardHeroArt, projectsBackdrop, projectsFoldersHero, vibyraLogo } from "../data/assets";
import { chatModelGroups, chatModelOptions, providerLogoSources } from "../data/chatModels";
import { COMMUNITY_COMMENTS_KEY, communityDetailAccent, communityDetailAccentDark, communityPosts } from "../data/community";
import { chatSuggestions, pages, previousChats, projectFilterModes, projectStatuses, tokenMembership } from "../data/pages";
import { styles } from "../styles";
import type { ChatModelOption, ChatModelProvider, CommunityComment, CommunityDetailTab, CommunityFilter, CommunityLogoKind, CommunityPost, CommunityPreviewKind, DashboardPage, DesktopCandidate, ProjectDisplay, ProjectLayout, SettingsTab } from "../types";
import { ProjectMenuItem } from "./chunk21";

export function ProjectCard({
  active,
  layout,
  menuOpen,
  onArchive,
  onCancelRename,
  onChangeRename,
  onDelete,
  onMore,
  onOpen,
  onPublish,
  onStartRename,
  onSubmitRename,
  project,
  renameValue,
  renaming
}: {
  active: boolean;
  layout: ProjectLayout;
  menuOpen: boolean;
  onArchive: () => void;
  onCancelRename: () => void;
  onChangeRename: (value: string) => void;
  onDelete: () => void;
  onMore: () => void;
  onOpen: () => void;
  onPublish: () => void;
  onStartRename: () => void;
  onSubmitRename: () => void;
  project: ProjectDisplay;
  renameValue: string;
  renaming: boolean;
}) {
  const status = project.status;
  const activeStatus = status === "Active";
  const published = status === "Published";
  const draft = status === "Draft";
  const archived = status === "Archived";
  const sourceIcon = status === "On PC" ? "desktop-outline" : status === "On mobile" ? "phone-portrait-outline" : null;
  const projectAccent = activeStatus ? "#59E8A0" : published ? "#BE62FF" : archived ? "#AAA6BC" : draft ? "#DAD6F6" : "#DAD6F6";
  const titleDot = activeStatus ? "#3CD783" : published ? "#B869FF" : archived ? "#6F6A80" : "#8F8AA3";

  return (
    <View style={[
      styles.projectCard,
      layout.cardStyle,
      activeStatus ? styles.projectCardStatusActive : null,
      draft ? styles.projectCardStatusDraft : null,
      published ? styles.projectCardStatusCompleted : null,
      archived ? styles.projectCardStatusArchived : null,
      menuOpen ? styles.projectCardMenuOpen : null
    ]}>
      <View style={[styles.projectCardMain, { gap: layout.mainGap }]}>
        <View style={[styles.projectIcon, layout.iconBoxStyle, activeStatus ? styles.projectIconActive : published ? styles.projectIconCompleted : archived ? styles.projectIconArchived : null]}>
          <Ionicons name="folder-open-outline" color={projectAccent} size={layout.folderIconSize} />
        </View>
        <View style={styles.projectCardCopy}>
          <View style={styles.projectTitleRow}>
            {renaming ? (
              <TextInput
                autoCapitalize="words"
                autoCorrect={false}
                autoFocus
                onBlur={onSubmitRename}
                onChangeText={onChangeRename}
                onSubmitEditing={onSubmitRename}
                placeholder="Project name"
                placeholderTextColor="#858197"
                returnKeyType="done"
                selectTextOnFocus
                style={styles.projectRenameInput}
                value={renameValue}
              />
            ) : (
              <Text numberOfLines={1} style={styles.projectName}>{project.name}</Text>
            )}
            <View style={[styles.projectTitleDot, { backgroundColor: titleDot }]} />
          </View>
          <Text numberOfLines={1} style={styles.projectMeta}>{project.path}</Text>
          <View style={styles.projectStackRow}>
            <View style={styles.projectStackDot} />
            <Text numberOfLines={1} style={styles.projectStack}>{project.stack}</Text>
          </View>
        </View>
        <View style={styles.projectCardRight}>
          {sourceIcon ? (
            <View style={styles.projectSourcePill}>
              <Ionicons name={sourceIcon} color="#DDBBFF" size={16} />
            </View>
          ) : (
            <Text style={[
              styles.projectStatusPill,
              layout.statusStyle,
              activeStatus ? styles.projectStatusActive : null,
              draft ? styles.projectStatusDraft : null,
              published ? styles.projectStatusCompleted : null,
              archived ? styles.projectStatusArchived : null
            ]}>{status}</Text>
          )}
          <Pressable hitSlop={8} onPress={onMore} style={styles.projectMoreButton}>
            <Ionicons name="ellipsis-vertical" color={menuOpen ? "#F1ECFF" : "#858197"} size={18} />
          </Pressable>
        </View>
      </View>
      {menuOpen ? (
        <View style={[styles.projectMenuLayer, { pointerEvents: "box-none" }]}>
          <View style={styles.projectMenu}>
            <ProjectMenuItem icon="create-outline" label="Rename" onPress={onStartRename} />
            <ProjectMenuItem icon="cloud-upload-outline" label="Publish" onPress={onPublish} />
            <ProjectMenuItem icon="archive-outline" label="Archive" onPress={onArchive} />
            <ProjectMenuItem danger icon="trash-outline" label="Delete" onPress={onDelete} />
          </View>
        </View>
      ) : null}

      <View style={styles.projectDivider} />

      <View style={[styles.projectCardFooter, layout.footerStyle]}>
        <View style={layout.footerDetailsStyle}>
          <View style={styles.projectFooterMeta}>
            <Ionicons name="calendar-outline" color="#AAA6BC" size={15} />
            <Text numberOfLines={1} style={styles.projectFooterText}>{project.updated}</Text>
          </View>
        </View>
        <View style={layout.footerActionsStyle}>
          <Pressable style={styles.projectOpenButton} onPress={onOpen}>
            <LinearGradient
              colors={["#6E31FF", "#5624E6"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.projectOpenGradient, layout.openGradientStyle]}
            >
              <Text style={[styles.projectOpenText, layout.openTextStyle]}>Open</Text>
              <Ionicons name="arrow-forward" color={colors.text} size={layout.openIconSize} />
            </LinearGradient>
          </Pressable>
          {renaming ? (
            <Pressable style={styles.projectRenameDoneButton} onPress={onSubmitRename}>
              <Text style={styles.projectRenameDoneText}>Done</Text>
            </Pressable>
          ) : null}
          {renaming ? (
            <Pressable style={styles.projectRenameCancelButton} onPress={onCancelRename}>
              <Ionicons name="close" color="#BEB9D4" size={18} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
