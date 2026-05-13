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
import { getDesktopStatusLabel, getDesktopStatusStyle } from "./chunk3";

export function PcSwitcherSheet({
  candidates,
  connectedMachineName,
  connectedUrl,
  currentMachineName,
  healthMessage,
  isConnected,
  manualCode,
  onClose,
  onCodeChange,
  onConfirm,
  onConnectCandidate,
  onConnectManual,
  onDisconnect,
  onScan,
  pairing,
  pairingError,
  pairingMessage,
  pendingMachineName,
  scanning,
  visible
}: {
  candidates: DesktopCandidate[];
  connectedMachineName?: string;
  connectedUrl?: string;
  currentMachineName: string;
  healthMessage: string;
  isConnected: boolean;
  manualCode: string;
  onClose: () => void;
  onCodeChange: (code: string) => void;
  onConfirm: () => void;
  onConnectCandidate: (desktop: DesktopCandidate) => Promise<void>;
  onConnectManual: () => Promise<void>;
  onDisconnect: () => void;
  onScan: () => Promise<void>;
  pairing: boolean;
  pairingError: string;
  pairingMessage: string;
  pendingMachineName?: string;
  scanning: boolean;
  visible: boolean;
}) {
  const [connectMode, setConnectMode] = useState<"auto" | "manual">("auto");
  const normalizeUrl = (url: string) => url.replace(/\/+$/, "").toLowerCase();
  const normalizedConnectedUrl = connectedUrl ? normalizeUrl(connectedUrl) : "";
  const visibleCandidates = candidates.filter((desktop) => {
    if (!isConnected) return true;
    if (desktop.status === "current") return false;
    if (normalizedConnectedUrl && normalizeUrl(desktop.url) === normalizedConnectedUrl) return false;
    if (connectedMachineName && desktop.machineName && desktop.machineName === connectedMachineName) return false;
    return true;
  });
  const statusMessage = pairing ? pairingMessage : healthMessage;
  const modeDisabled = pairing || scanning;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.pcSwitcherOverlay}>
        <Pressable accessibilityLabel="Close PC switcher" style={styles.pcSwitcherScrim} onPress={onClose} />
        <View style={styles.pcSwitcherSheet}>
          <View style={styles.pcSwitcherHandle} />
          <View style={styles.pcSwitcherHeader}>
            <View style={styles.pcSwitcherHeaderIcon}>
              <Ionicons name="desktop-outline" color="#DAD2FF" size={24} />
            </View>
            <View style={styles.pcSwitcherHeaderCopy}>
              <Text style={styles.pcSwitcherKicker}>{isConnected ? "Connected PC" : "Not connected"}</Text>
              <Text numberOfLines={1} style={styles.pcSwitcherTitle}>{currentMachineName}</Text>
            </View>
            <Pressable style={styles.pcSwitcherClose} onPress={onClose}>
              <Ionicons name="close" color="#BDB8CE" size={21} />
            </Pressable>
          </View>

          {pendingMachineName ? (
            <View style={styles.pcApprovalCard}>
              <View style={styles.pcApprovalIcon}>
                <Ionicons name="shield-checkmark-outline" color="#70F0A2" size={23} />
              </View>
              <View style={styles.pcApprovalCopy}>
                <Text style={styles.pcApprovalTitle}>Approve {pendingMachineName}</Text>
                <Text style={styles.pcApprovalText}>The desktop has approved. Confirm on this phone to switch.</Text>
              </View>
              <Pressable style={styles.pcConfirmButton} onPress={onConfirm}>
                <Text style={styles.pcConfirmButtonText}>Confirm</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.pcConnectTabs}>
            {(["auto", "manual"] as const).map((mode) => {
              const active = connectMode === mode;
              return (
                <Pressable disabled={modeDisabled} key={mode} onPress={() => setConnectMode(mode)} style={[styles.pcConnectTab, active ? styles.pcConnectTabActive : null, modeDisabled ? styles.pcControlDisabled : null]}>
                  <Ionicons name={mode === "auto" ? "wifi-outline" : "keypad-outline"} color={active ? colors.text : "#9E98B1"} size={15} />
                  <Text style={[styles.pcConnectTabText, active ? styles.pcConnectTabTextActive : null]}>{mode === "auto" ? "Automatic" : "Manual"}</Text>
                </Pressable>
              );
            })}
          </View>

          {isConnected ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Disconnect PC"
              disabled={pairing || scanning}
              onPress={onDisconnect}
              style={({ pressed }) => [
                styles.pcDisconnectButton,
                (pairing || scanning) ? styles.pcControlDisabled : null,
                pressed ? styles.pcDisconnectButtonPressed : null
              ]}
            >
              <Ionicons name="power-outline" color="#FFB2C0" size={19} />
              <Text style={styles.pcDisconnectButtonText}>Disconnect PC</Text>
            </Pressable>
          ) : null}

          {connectMode === "auto" ? <>
            <Pressable disabled={pairing || scanning} style={[styles.pcScanButton, pairing || scanning ? styles.pcControlDisabled : null]} onPress={onScan}>
              {scanning ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name="search-outline" color={colors.text} size={21} />}
              <Text style={styles.pcScanButtonText}>{scanning ? "Finding nearby PCs..." : candidates.length > 0 ? "Search again" : "Find nearby PCs"}</Text>
            </Pressable>
            <View style={styles.pcCandidateList}>
              {visibleCandidates.map((desktop) => {
                const disabled = pairing || scanning || desktop.status === "offline";
                return (
                  <Pressable disabled={disabled} key={`${desktop.url}-${desktop.pairCode}`} style={[styles.pcCandidateRow, disabled ? styles.pcControlDisabled : null]} onPress={() => onConnectCandidate(desktop)}>
                    <View style={[styles.pcCandidateIcon, desktop.status === "current" ? styles.pcCandidateIconCurrent : null]}><Ionicons name="desktop-outline" color="#BFAEFF" size={21} /></View>
                    <View style={styles.pcCandidateCopy}>
                      <Text numberOfLines={1} style={styles.pcCandidateTitle}>{desktop.machineName}</Text>
                      <View style={styles.pcCandidateStatusRow}><View style={[styles.pcCandidateStatusDot, getDesktopStatusStyle(desktop.status)]} /><Text style={styles.pcCandidateMeta}>{getDesktopStatusLabel(desktop.status)}</Text></View>
                    </View>
                    <Ionicons name="chevron-forward" color="#A9A6BE" size={21} />
                  </Pressable>
                );
              })}
            </View>
          </> : <View style={styles.pcManualPanel}>
            <Text style={styles.pcManualTitle}>Enter code</Text>
            <View style={styles.pcCodeRow}>
              <TextInput
                autoCapitalize="characters"
                autoCorrect={false}
                onChangeText={onCodeChange}
                onSubmitEditing={onConnectManual}
                placeholder="PAIR CODE"
                placeholderTextColor="#78738C"
                style={styles.pcCodeInput}
                value={manualCode}
              />
              <Pressable disabled={pairing} style={[styles.pcCodeButton, pairing ? styles.pcControlDisabled : null]} onPress={onConnectManual}>
                {pairing ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name="link-outline" color={colors.text} size={20} />}
              </Pressable>
            </View>
          </View>}

          {statusMessage ? <Text style={styles.pcSwitcherMessage}>{statusMessage}</Text> : null}
          {pairingError ? <Text style={styles.pcSwitcherError}>{pairingError}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}
