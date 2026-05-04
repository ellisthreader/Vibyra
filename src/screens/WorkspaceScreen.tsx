import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  ImageStyle,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TextInput,
  useWindowDimensions,
  View,
  ViewStyle
} from "react-native";
import { VibyraLogo } from "../components/VibyraLogo";
import { useAppContext } from "../context/AppContext";
import { colors } from "../styles/theme";
import { ChatMessage, Project, RememberedDesktop } from "../types/domain";

const dashboardBackdrop = require("../assets/home-ready-build.png");
const chatBuildAiHero = require("../assets/chat-build-ai-hero.png");
const projectsBackdrop = require("../assets/result-background.png");
const projectsFoldersHero = require("../assets/projects-folders-hero-glow-transparent.png");
type DashboardPage = "dashboard" | "projects" | "chat" | "community" | "profile";
type SettingsTab = "profile" | "billing" | "preferences" | "security";
type DesktopCandidate = RememberedDesktop;

const pages: Array<{ key: DashboardPage; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: "dashboard", label: "Dashboard", icon: "grid-outline" },
  { key: "projects", label: "Projects", icon: "folder-open-outline" },
  { key: "chat", label: "AI Chat", icon: "chatbubble-ellipses-outline" },
  { key: "community", label: "Community", icon: "people-outline" },
  { key: "profile", label: "Profile", icon: "person-circle-outline" }
];

const projectStatuses = ["Active", "Draft", "Completed"] as const;
const projectFilterModes = ["All", "Active", "Draft", "Completed", "Archived"] as const;
const tokenMembership = {
  allowance: 1500,
  balance: 1240,
  bonusTokens: 200,
  modelAccess: "Efficient models",
  nextPlan: "Builder",
  plan: "Starter",
  renewal: "Renews monthly",
  used: 260
};

const tokenUsageRows = [
  { icon: "code-slash-outline" as const, label: "AI coding tasks", value: "Build, edit, debug" },
  { icon: "hardware-chip-outline" as const, label: "Model access", value: tokenMembership.modelAccess },
  { icon: "image-outline" as const, label: "Asset generation", value: "Images and app assets" }
];

const previousChats = [
  { detail: "Edited hero.tsx", icon: "chatbubble-ellipses-outline" as const, id: "landing-polish", meta: "Current chat", running: true, time: "2 mins ago", title: "Landing page polish" },
  { detail: "Investigating login issue", icon: "bug-outline" as const, id: "auth-bug", meta: "Saved 2d ago", running: false, time: "2d ago", title: "Fix auth bug" },
  { detail: "Refactoring components", icon: "chatbubble-ellipses-outline" as const, id: "pricing-page", meta: "Saved 5d ago", running: false, time: "5d ago", title: "SaaS pricing page" },
  { detail: "Optimising queries", icon: "bug-outline" as const, id: "database-optimisation", meta: "Saved 1w ago", running: true, time: "1w ago", title: "Database optimisation" }
];

const chatSuggestions = [
  { color: "#B24CFF", icon: "code-slash-outline" as const, text: "Update the landing page hero section" },
  { color: "#FF4F90", icon: "bug-outline" as const, text: "Fix the login redirect bug" },
  { color: "#43E585", icon: "add-circle-outline" as const, text: "Add a pricing comparison section" },
  { color: "#F5C542", icon: "document-text-outline" as const, text: "Refactor API integration" }
];

const communityPosts = [
  {
    accent: "#9B5CFF",
    comments: 9,
    description: "Automate invoices and billing with AI. Save hours of work.",
    likes: 42,
    preview: "invoice" as const,
    tag: "Popular",
    tags: ["SaaS", "AI"],
    time: "2h ago",
    title: "AI invoice tool",
    user: "Maya"
  },
  {
    accent: "#51E895",
    comments: 4,
    description: "Track habits, build consistency, and achieve your goals.",
    likes: 18,
    preview: "habit" as const,
    tag: "Recent",
    tags: ["Productivity", "Health"],
    time: "5h ago",
    title: "Habit tracker app",
    user: "Noah"
  },
  {
    accent: "#5792FF",
    comments: 6,
    description: "Beautiful analytics dashboard for SaaS founders.",
    likes: 31,
    preview: "analytics" as const,
    tag: "Featured",
    tags: ["SaaS", "Analytics"],
    time: "1d ago",
    title: "SaaS analytics board",
    user: "Leah"
  }
];

type ProjectDisplay = {
  branch: string;
  id: string;
  name: string;
  path: string;
  sourceProject?: Project;
  stack: string;
  status: typeof projectStatuses[number] | "Archived";
  updated: string;
};

type ProjectLayout = {
  actionButtonSize: number;
  cardStyle: StyleProp<ViewStyle>;
  createIconSize: number;
  folderIconSize: number;
  footerActionsStyle: StyleProp<ViewStyle>;
  footerDetailsStyle: StyleProp<ViewStyle>;
  footerStyle: StyleProp<ViewStyle>;
  heroImageStyle: StyleProp<ImageStyle>;
  iconBoxStyle: StyleProp<ViewStyle>;
  mainGap: number;
  openGradientStyle: StyleProp<ViewStyle>;
  openIconSize: number;
  openTextStyle: StyleProp<TextStyle>;
  statusStyle: StyleProp<TextStyle>;
};

function getProjectsLayout(width: number, height: number): ProjectLayout {
  const portraitRatio = height / width;
  const narrow = width <= 393;
  const compact = width <= 375;
  const roomy = width >= 428;
  const tallNarrow = portraitRatio >= 2.1 && width <= 393;

  if (compact) {
    return {
      actionButtonSize: 30,
      cardStyle: { borderRadius: 14, padding: 12 },
      createIconSize: 23,
      folderIconSize: 21,
      footerActionsStyle: styles.projectFooterActionsStacked,
      footerDetailsStyle: styles.projectFooterDetailsStacked,
      footerStyle: styles.projectCardFooterStacked,
      heroImageStyle: styles.projectsFoldersHeroCompact,
      iconBoxStyle: { borderRadius: 11, height: 38, width: 38 },
      mainGap: 9,
      openGradientStyle: { height: 32, paddingHorizontal: 10 },
      openIconSize: 15,
      openTextStyle: { fontSize: 12 },
      statusStyle: { fontSize: 10, paddingHorizontal: 8, paddingVertical: 5 }
    };
  }

  if (narrow || tallNarrow) {
    return {
      actionButtonSize: 32,
      cardStyle: { borderRadius: 15, padding: 14 },
      createIconSize: 25,
      folderIconSize: 22,
      footerActionsStyle: styles.projectFooterActionsStacked,
      footerDetailsStyle: styles.projectFooterDetailsStacked,
      footerStyle: styles.projectCardFooterStacked,
      heroImageStyle: styles.projectsFoldersHeroNarrow,
      iconBoxStyle: { borderRadius: 12, height: 40, width: 40 },
      mainGap: 10,
      openGradientStyle: { height: 33, paddingHorizontal: 11 },
      openIconSize: 16,
      openTextStyle: { fontSize: 12 },
      statusStyle: { fontSize: 10, paddingHorizontal: 9, paddingVertical: 5 }
    };
  }

  if (!roomy) {
    return {
      actionButtonSize: 33,
      cardStyle: { borderRadius: 15, padding: 15 },
      createIconSize: 26,
      folderIconSize: 23,
      footerActionsStyle: styles.projectFooterActionsComfort,
      footerDetailsStyle: styles.projectFooterDetails,
      footerStyle: styles.projectCardFooterComfort,
      heroImageStyle: styles.projectsFoldersHeroComfort,
      iconBoxStyle: { borderRadius: 12, height: 42, width: 42 },
      mainGap: 11,
      openGradientStyle: { height: 34, paddingHorizontal: 11 },
      openIconSize: 16,
      openTextStyle: null,
      statusStyle: { paddingHorizontal: 9 }
    };
  }

  return {
    actionButtonSize: 34,
    cardStyle: null,
    createIconSize: 27,
    folderIconSize: 24,
    footerActionsStyle: styles.projectFooterActions,
    footerDetailsStyle: styles.projectFooterDetails,
    footerStyle: null,
    heroImageStyle: null,
    iconBoxStyle: null,
    mainGap: 12,
    openGradientStyle: null,
    openIconSize: 17,
    openTextStyle: null,
    statusStyle: null
  };
}

const projectMockups: ProjectDisplay[] = [
  {
    branch: "main",
    id: "mock-saas",
    name: "SaaS",
    path: "/home/ellis/Desktop/SaaS",
    stack: "Expo React Native",
    status: "Active",
    updated: "Updated 1 min ago"
  },
  {
    branch: "develop",
    id: "mock-backend",
    name: "backend",
    path: "/home/ellis/Desktop/SaaS/backend",
    stack: "Node / React",
    status: "Draft",
    updated: "Updated 3d ago"
  },
  {
    branch: "main",
    id: "mock-portfolio",
    name: "Portfolio",
    path: "/home/ellis/Desktop/Portfolio",
    stack: "Next.js / Tailwind",
    status: "Completed",
    updated: "Updated 2w ago"
  },
  {
    branch: "main",
    id: "mock-marketing",
    name: "Marketing Site",
    path: "/home/ellis/Desktop/Marketing",
    stack: "Next.js",
    status: "Draft",
    updated: "Updated 1mo ago"
  }
];

export function WorkspaceScreen() {
  const app = useAppContext();
  const { height, width } = useWindowDimensions();
  const compact = width < 420;
  const [activePage, setActivePage] = useState<DashboardPage>("dashboard");
  const [desktopCandidates, setDesktopCandidates] = useState<DesktopCandidate[]>(app.rememberedDesktops);
  const [pcSwitcherVisible, setPcSwitcherVisible] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [switcherScanning, setSwitcherScanning] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [tokenSheetVisible, setTokenSheetVisible] = useState(false);

  const filteredProjects = useMemo(() => {
    const search = projectSearch.trim().toLowerCase();
    if (!search) return app.projects;
    return app.projects.filter((project) => (
      project.name.toLowerCase().includes(search) ||
      project.path.toLowerCase().includes(search) ||
      project.stack.toLowerCase().includes(search)
    ));
  }, [app.projects, projectSearch]);

  const connectedMachineName = app.connection?.machineName ?? app.rememberedDesktops[0]?.machineName ?? app.machineName;

  useEffect(() => {
    if (app.rememberedDesktops.length > 0) setDesktopCandidates(app.rememberedDesktops);
  }, [app.rememberedDesktops]);

  const openPcSwitcher = useCallback(() => {
    setPcSwitcherVisible(true);
  }, []);

  const scanDesktops = useCallback(async () => {
    setSwitcherScanning(true);
    const results = await app.discoverPairableDesktops();
    setDesktopCandidates(results);
    setSwitcherScanning(false);
  }, [app]);

  const connectToDesktop = useCallback(async (desktop: DesktopCandidate) => {
    await app.pairMachineAt(desktop.url, desktop.pairCode);
  }, [app]);

  const connectWithCode = useCallback(async () => {
    await app.pairMachine();
  }, [app]);

  const confirmPcSwitch = useCallback(() => {
    app.confirmPhonePermission();
    setPcSwitcherVisible(false);
  }, [app]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
      <View style={styles.shell}>
        <View style={styles.main}>
          <TopBar
            compact={compact}
            machineName={connectedMachineName}
            onOpenPcSwitcher={openPcSwitcher}
            onOpenTokens={() => setTokenSheetVisible(true)}
            tokenBalance={tokenMembership.balance}
          />
          <ScrollView
            contentContainerStyle={[
              styles.content,
              activePage === "dashboard" ? styles.dashboardContent : null,
              activePage === "chat" ? styles.chatContent : null,
              activePage === "chat" && selectedChatId ? styles.chatActiveContent : null,
              activePage === "projects" ? styles.projectsContent : null,
              { minHeight: Math.max(height - (activePage === "dashboard" ? 190 : activePage === "chat" ? selectedChatId ? 84 : 184 : 72), 0) }
            ]}
            scrollEnabled={activePage !== "dashboard" && !(activePage === "chat" && selectedChatId)}
            showsVerticalScrollIndicator={false}
          >
            {activePage === "dashboard" ? (
              <DashboardHome
                activeAgents={app.activeAgents.length}
                machineName={app.connection?.machineName ?? app.machineName}
                onCreateProject={app.createProject}
                onNavigate={setActivePage}
                projectCount={app.projects.length}
                selectedModel={app.selectedModel}
                tokenBalance={tokenMembership.balance}
              />
            ) : null}

            {activePage === "projects" ? (
              <ProjectsPage
                filteredProjects={filteredProjects}
                onCreateProject={app.createProject}
                onSearch={setProjectSearch}
                onSelectProject={app.selectProject}
                projectSearch={projectSearch}
                selectedProjectId={app.selectedProject.id}
              />
            ) : null}

            {activePage === "chat" ? (
              <AIChatPage
                agentRequesting={app.agentRequesting}
                chatMessages={app.chatMessages}
                onStart={app.startAgent}
                selectedChatId={selectedChatId}
                selectedFileName={app.selectedFile.name}
                setSelectedChatId={setSelectedChatId}
                setTaskText={app.setTaskText}
                taskText={app.taskText}
              />
            ) : null}

            {activePage === "community" ? <CommunityPage /> : null}

            {activePage === "profile" ? (
              <ProfilePage
                activeTab={settingsTab}
                email={app.authEmail || "you@vibyra.app"}
                machineName={app.machineName}
                onTabChange={setSettingsTab}
                projectCount={app.projects.length}
                selectedModel={app.selectedModel}
              />
            ) : null}
          </ScrollView>
        </View>
        {activePage === "chat" && selectedChatId ? null : <BottomNav activePage={activePage} onChange={setActivePage} />}
        <PcSwitcherSheet
          candidates={desktopCandidates}
          currentMachineName={connectedMachineName}
          healthMessage={app.healthMessage}
          manualCode={app.pairCode}
          onClose={() => setPcSwitcherVisible(false)}
          onCodeChange={app.setPairCode}
          onConfirm={confirmPcSwitch}
          onConnectCandidate={connectToDesktop}
          onConnectManual={connectWithCode}
          onScan={scanDesktops}
          pairing={app.pairing}
          pairingError={app.pairingError}
          pendingMachineName={app.pendingPhoneApproval?.machineName}
          scanning={switcherScanning || app.checkingHealth}
          visible={pcSwitcherVisible}
        />
        <TokenMembershipSheet
          onClose={() => setTokenSheetVisible(false)}
          onManage={() => {
            setTokenSheetVisible(false);
            setActivePage("profile");
            setSettingsTab("billing");
          }}
          visible={tokenSheetVisible}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function BottomNav(props: { activePage: DashboardPage; onChange: (page: DashboardPage) => void }) {
  return (
    <View style={styles.bottomNav}>
      {pages.map((page) => {
        const active = page.key === props.activePage;
        return (
          <Pressable
            key={page.key}
            onPress={() => props.onChange(page.key)}
            style={[styles.bottomNavItem, active ? styles.bottomNavItemActive : null]}
          >
            <Ionicons name={page.icon} color={active ? "#A95BFF" : "#A8A7BA"} size={24} />
            <Text numberOfLines={1} style={[styles.bottomNavText, active ? styles.bottomNavTextActive : null]}>
              {page.key === "dashboard" ? "Home" : page.key === "profile" ? "Profile" : page.label.replace("AI ", "")}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TopBar({ compact, machineName, onOpenPcSwitcher, onOpenTokens, tokenBalance }: {
  compact: boolean;
  machineName: string;
  onOpenPcSwitcher: () => void;
  onOpenTokens: () => void;
  tokenBalance: number;
}) {
  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change connected PC"
        hitSlop={8}
        onPress={onOpenPcSwitcher}
        style={({ pressed }) => [styles.topLeft, pressed ? styles.topLeftPressed : null]}
      >
        <VibyraLogo compact style={styles.dashboardLogo} />
        <View style={styles.topMachineCopy}>
          <View style={styles.topConnectionRow}>
            <View style={styles.statusDot} />
            <Text style={styles.topKicker}>Connected to PC</Text>
          </View>
          <View style={styles.topTitleRow}>
            <Text numberOfLines={1} style={styles.topTitle}>{machineName}</Text>
            <Ionicons name="chevron-down" color="#A9A6BE" size={16} />
          </View>
        </View>
      </Pressable>
      <View style={styles.topRight}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open token balance and membership"
          hitSlop={8}
          onPress={onOpenTokens}
          style={({ pressed }) => [styles.tokenPill, pressed ? styles.tokenPillPressed : null]}
        >
          <Ionicons name="flash-outline" color="#FFE76A" size={compact ? 18 : 20} />
          <View>
            <Text style={styles.tokenText}>{tokenBalance.toLocaleString()}</Text>
            <Text style={styles.tokenSubtext}>tokens</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

function getDesktopStatusLabel(status: RememberedDesktop["status"], pairCode: string) {
  if (status === "current") return "Connected now";
  if (status === "online") return `Available nearby - code ${pairCode}`;
  if (status === "checking") return "Checking activity...";
  return "Not reachable on this Wi-Fi";
}

function getDesktopStatusStyle(status: RememberedDesktop["status"]) {
  if (status === "current") return styles.pcCandidateStatusCurrent;
  if (status === "online") return styles.pcCandidateStatusOnline;
  if (status === "checking") return styles.pcCandidateStatusChecking;
  return styles.pcCandidateStatusOffline;
}

function PcSwitcherSheet({
  candidates,
  currentMachineName,
  healthMessage,
  manualCode,
  onClose,
  onCodeChange,
  onConfirm,
  onConnectCandidate,
  onConnectManual,
  onScan,
  pairing,
  pairingError,
  pendingMachineName,
  scanning,
  visible
}: {
  candidates: DesktopCandidate[];
  currentMachineName: string;
  healthMessage: string;
  manualCode: string;
  onClose: () => void;
  onCodeChange: (code: string) => void;
  onConfirm: () => void;
  onConnectCandidate: (desktop: DesktopCandidate) => Promise<void>;
  onConnectManual: () => Promise<void>;
  onScan: () => Promise<void>;
  pairing: boolean;
  pairingError: string;
  pendingMachineName?: string;
  scanning: boolean;
  visible: boolean;
}) {
  const visibleCandidates = candidates.length > 0 ? candidates : [];

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
              <Text style={styles.pcSwitcherKicker}>Connected PC</Text>
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

          <Pressable style={styles.pcScanButton} onPress={onScan}>
            {scanning ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name="search-outline" color={colors.text} size={21} />}
            <Text style={styles.pcScanButtonText}>{scanning ? "Finding nearby PCs..." : candidates.length > 0 ? "Search again" : "Find nearby PCs"}</Text>
          </Pressable>

          <View style={styles.pcCandidateList}>
            {visibleCandidates.map((desktop) => (
              <Pressable key={`${desktop.url}-${desktop.pairCode}`} style={styles.pcCandidateRow} onPress={() => onConnectCandidate(desktop)}>
                <View style={[styles.pcCandidateIcon, desktop.status === "current" ? styles.pcCandidateIconCurrent : null]}>
                  <Ionicons name="desktop-outline" color="#BFAEFF" size={21} />
                </View>
                <View style={styles.pcCandidateCopy}>
                  <Text numberOfLines={1} style={styles.pcCandidateTitle}>{desktop.machineName}</Text>
                  <View style={styles.pcCandidateStatusRow}>
                    <View style={[styles.pcCandidateStatusDot, getDesktopStatusStyle(desktop.status)]} />
                    <Text style={styles.pcCandidateMeta}>{getDesktopStatusLabel(desktop.status, desktop.pairCode)}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" color="#A9A6BE" size={21} />
              </Pressable>
            ))}
          </View>

          <View style={styles.pcManualPanel}>
            <Text style={styles.pcManualTitle}>Connect with code</Text>
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
              <Pressable style={styles.pcCodeButton} onPress={onConnectManual}>
                {pairing ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name="link-outline" color={colors.text} size={20} />}
              </Pressable>
            </View>
          </View>

          {healthMessage ? <Text style={styles.pcSwitcherMessage}>{healthMessage}</Text> : null}
          {pairingError ? <Text style={styles.pcSwitcherError}>{pairingError}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

function TokenMembershipSheet({ onClose, onManage, visible }: {
  onClose: () => void;
  onManage: () => void;
  visible: boolean;
}) {
  const progress = Math.min(1, tokenMembership.used / tokenMembership.allowance);
  const availablePercent = Math.round((tokenMembership.balance / tokenMembership.allowance) * 100);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.tokenSheetOverlay}>
        <Pressable accessibilityLabel="Close token membership" style={styles.tokenSheetScrim} onPress={onClose} />
        <View style={styles.tokenSheet}>
          <View style={styles.tokenSheetHandle} />
          <View style={styles.tokenSheetHeader}>
            <View style={styles.tokenSheetHeaderIcon}>
              <Ionicons name="flash" color="#FFE76A" size={24} />
            </View>
            <View style={styles.tokenSheetHeaderCopy}>
              <Text style={styles.tokenSheetKicker}>{tokenMembership.plan} membership</Text>
              <Text style={styles.tokenSheetTitle}>{tokenMembership.balance.toLocaleString()} tokens available</Text>
            </View>
            <Pressable style={styles.tokenSheetClose} onPress={onClose}>
              <Ionicons name="close" color="#BDB8CE" size={21} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.tokenSheetContent} showsVerticalScrollIndicator={false} style={styles.tokenSheetScroll}>
            <View style={styles.tokenHeroPanel}>
              <View style={styles.tokenHeroTop}>
                <View>
                  <Text style={styles.tokenHeroLabel}>Current cycle</Text>
                  <Text style={styles.tokenHeroValue}>{availablePercent}% remaining</Text>
                </View>
                <View style={styles.tokenRenewalBadge}>
                  <Ionicons name="refresh-outline" color="#FFF2A4" size={15} />
                  <Text style={styles.tokenRenewalText}>{tokenMembership.renewal}</Text>
                </View>
              </View>
              <View style={styles.tokenTrack}>
                <LinearGradient
                  colors={["#FFE76A", "#FFB44F", "#9B5CFF"]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[styles.tokenTrackFill, { width: `${progress * 100}%` }]}
                />
              </View>
              <View style={styles.tokenCycleStats}>
                <TokenMiniStat label="Used" value={tokenMembership.used.toLocaleString()} />
                <TokenMiniStat label="Allowance" value={tokenMembership.allowance.toLocaleString()} />
                <TokenMiniStat label="Bonus" value={`+${tokenMembership.bonusTokens}`} />
              </View>
            </View>

            <View style={styles.tokenUsagePanel}>
              <Text style={styles.tokenSectionTitle}>Tokens power</Text>
              {tokenUsageRows.map((row) => (
                <View key={row.label} style={styles.tokenUsageRow}>
                  <View style={styles.tokenUsageIcon}>
                    <Ionicons name={row.icon} color="#FFE76A" size={18} />
                  </View>
                  <View style={styles.tokenUsageCopy}>
                    <Text style={styles.tokenUsageLabel}>{row.label}</Text>
                    <Text style={styles.tokenUsageValue}>{row.value}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Pressable style={({ pressed }) => [styles.tokenManageButton, pressed ? styles.tokenManageButtonPressed : null]} onPress={onManage}>
              <LinearGradient
                colors={["#7A35FF", "#A85DFF", "#FFB44F"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.tokenManageGradient}
              >
                <Ionicons name="card-outline" color={colors.text} size={20} />
                <Text style={styles.tokenManageText}>Manage membership</Text>
              </LinearGradient>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function TokenMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tokenMiniStat}>
      <Text style={styles.tokenMiniStatLabel}>{label}</Text>
      <Text style={styles.tokenMiniStatValue}>{value}</Text>
    </View>
  );
}

function MobileConnectionCard({ machineName }: { machineName: string }) {
  return (
    <View style={styles.mobileConnectionCard}>
      <View style={styles.statusDot} />
      <View style={styles.mobileConnectionCopy}>
        <Text style={styles.topKicker}>Connected to PC</Text>
        <Text numberOfLines={1} style={styles.statusText}>{machineName}</Text>
      </View>
    </View>
  );
}

function DashboardHome(props: {
  activeAgents: number;
  machineName: string;
  onCreateProject: () => void;
  onNavigate: (page: DashboardPage) => void;
  projectCount: number;
  selectedModel: string;
  tokenBalance: number;
}) {
  const activeTasks = props.activeAgents > 0 ? props.activeAgents : 2;
  const displayProjectCount = Math.max(props.projectCount, 7);

  return (
    <View style={styles.dashboardPage}>
      <View style={styles.welcomePanel}>
        <View style={styles.welcomeBackdrop}>
          <View pointerEvents="none" style={styles.welcomeBackdropLayer}>
            <Image
              blurRadius={18}
              resizeMode="cover"
              source={dashboardBackdrop}
              style={[styles.welcomeBackdropLayer, styles.welcomeBackdropFill]}
            />
            <Image
              resizeMode="contain"
              source={dashboardBackdrop}
              style={styles.welcomeBackdropLayer}
            />
          </View>
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(5, 6, 17, 0.92)", "rgba(7, 6, 18, 0.62)", "rgba(8, 6, 18, 0.16)"]}
            locations={[0, 0.48, 1]}
            start={{ x: 0, y: 0.45 }}
            end={{ x: 1, y: 0.45 }}
            style={styles.welcomeBackdropShade}
          />

          <View style={styles.welcomeCopy}>
            <Text style={styles.welcomeTitle}>Ready to build.</Text>
            <Text style={[styles.bodyText, styles.welcomeBodyText]}>Everything you need,{'\n'}all in one place.</Text>
          </View>

          <View style={styles.heroActionsRow}>
            <Pressable style={styles.heroPrimaryButton} onPress={props.onCreateProject}>
              <Ionicons name="add" color={colors.text} size={26} />
              <Text style={styles.heroPrimaryButtonText}>Create Project</Text>
            </Pressable>
            <View style={styles.taskPill}>
              <View style={styles.taskDot} />
              <Text style={styles.taskPillText}>{activeTasks} AI TASKS RUNNING</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.dashboardStats}>
        <DashboardStat icon="folder-open-outline" value={displayProjectCount.toString()} label={"Projects\nsaved"} />
        <DashboardStat icon="chatbubble-ellipses-outline" value="18" label={"AI Chats\nthis week"} />
        <DashboardStat icon="terminal-outline" value="24" label={"AI Prompts\nused"} />
        <DashboardStat icon="time-outline" value="12h" label={"Time saved\nthis week"} last />
      </View>

      <View style={styles.homeActions}>
        <HomeAction icon="folder-open-outline" label="Projects" meta="View and manage your projects" badge={`${displayProjectCount} saved`} onPress={() => props.onNavigate("projects")} />
        <HomeAction icon="chatbubble-ellipses-outline" label="AI Chat" meta="Start building with AI" onPress={() => props.onNavigate("chat")} />
        <HomeAction icon="people-outline" label="Community" meta="Explore ideas and connect" onPress={() => props.onNavigate("community")} />
        <HomeAction icon="flash-outline" label="Usage & Billing" meta="Track usage and manage plan" onPress={() => props.onNavigate("profile")} />
      </View>
    </View>
  );
}

function DashboardStat({ icon, value, label, last }: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.dashboardStat, last ? styles.dashboardStatLast : null]}>
      <View style={styles.dashboardStatTop}>
        <Ionicons name={icon} color="#B65BFF" size={22} />
        <Text style={styles.dashboardStatValue}>{value}</Text>
      </View>
      <Text style={styles.dashboardStatLabel}>{label}</Text>
    </View>
  );
}

function HomeAction({ icon, label, meta, badge, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  meta: string;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.homeAction} onPress={onPress}>
      <View style={styles.homeActionIcon}>
        <Ionicons name={icon} color="#D9D0FF" size={22} />
      </View>
      <View style={styles.homeActionCopy}>
        <Text style={styles.homeActionLabel}>{label}</Text>
        <Text style={styles.homeActionMeta}>{meta}</Text>
      </View>
      {badge ? <Text style={styles.homeActionBadge}>{badge}</Text> : null}
      <Ionicons name="chevron-forward" color="#A9A6BE" size={24} />
    </Pressable>
  );
}

function ProjectsPage(props: {
  filteredProjects: Project[];
  onCreateProject: () => void;
  onSearch: (value: string) => void;
  onSelectProject: (projectId: string) => void;
  projectSearch: string;
  selectedProjectId: string;
}) {
  const { height, width } = useWindowDimensions();
  const projectLayout = useMemo(() => getProjectsLayout(width, height), [height, width]);
  const [archivedProjectIds, setArchivedProjectIds] = useState<Set<string>>(() => new Set());
  const [deletedProjectIds, setDeletedProjectIds] = useState<Set<string>>(() => new Set());
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<typeof projectFilterModes[number]>("All");
  const [openedProjectId, setOpenedProjectId] = useState<string | null>(null);
  const hasSearch = props.projectSearch.trim().length > 0;
  const baseProjects = hasSearch
    ? props.filteredProjects.map((project, index): ProjectDisplay => ({
      branch: index % 2 === 0 ? "main" : "develop",
      id: project.id,
      name: project.name,
      path: project.path,
      sourceProject: project,
      stack: project.stack,
      status: projectStatuses[index % projectStatuses.length],
      updated: `Updated ${project.updated}`
    }))
    : projectMockups.map((mockup, index) => ({
      ...mockup,
      sourceProject: props.filteredProjects[index]
    }));
  const displayProjects = baseProjects
    .filter((project) => !deletedProjectIds.has(project.id))
    .map((project) => ({
      ...project,
      status: archivedProjectIds.has(project.id) ? "Archived" as const : project.status
    }))
    .filter((project) => filterMode === "All" || project.status === filterMode);

  function cycleFilterMode() {
    const currentIndex = projectFilterModes.indexOf(filterMode);
    setFilterMode(projectFilterModes[(currentIndex + 1) % projectFilterModes.length]);
  }

  function openProject(project: ProjectDisplay) {
    setOpenedProjectId(project.id);
    setExpandedProjectId(null);
    if (project.sourceProject) props.onSelectProject(project.sourceProject.id);
  }

  function archiveProject(projectId: string) {
    setDeletedProjectIds((current) => {
      const next = new Set(current);
      next.delete(projectId);
      return next;
    });
    setArchivedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
    setExpandedProjectId(projectId);
  }

  function deleteProject(projectId: string) {
    setDeletedProjectIds((current) => new Set(current).add(projectId));
    setArchivedProjectIds((current) => {
      const next = new Set(current);
      next.delete(projectId);
      return next;
    });
    if (openedProjectId === projectId) setOpenedProjectId(null);
    if (expandedProjectId === projectId) setExpandedProjectId(null);
  }

  return (
    <View style={styles.projectsScreen}>
      <ImageBackground source={projectsBackdrop} style={styles.projectsBackdrop} imageStyle={styles.projectsBackdropImage}>
        <View style={styles.projectsBackdropShade} />
      </ImageBackground>

      <View style={styles.projectsHero}>
        <View style={styles.projectsHeroCopy}>
          <Text style={styles.projectsHeroTitle}>Projects</Text>
          <Text style={styles.projectsHeroSubtitle}>Manage and organize all your workspace projects.</Text>
          <Pressable style={styles.projectsCreateButton} onPress={props.onCreateProject}>
            <LinearGradient
              colors={["#6630FF", "#7433FF", "#6425E6"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.projectsCreateGradient}
            >
              <Ionicons name="add" color={colors.text} size={projectLayout.createIconSize} />
              <Text style={styles.projectsCreateText}>Create Project</Text>
            </LinearGradient>
          </Pressable>
        </View>
        <Image source={projectsFoldersHero} style={[styles.projectsFoldersHero, projectLayout.heroImageStyle]} resizeMode="contain" />
      </View>

      <View style={styles.projectsSearchRow}>
        <View style={styles.projectsSearchBar}>
          <Ionicons name="search-outline" color="#8E8AA3" size={22} />
          <TextInput
            value={props.projectSearch}
            onChangeText={props.onSearch}
            placeholder="Search projects..."
            placeholderTextColor="#8E8AA3"
            style={styles.projectsSearchInput}
          />
        </View>
        <Pressable style={[styles.projectsFilterButton, filterMode !== "All" ? styles.projectsFilterButtonActive : null]} onPress={cycleFilterMode}>
          <Ionicons name="options-outline" color="#B4B1C9" size={22} />
        </Pressable>
      </View>

      <Text style={styles.projectsFilterLabel}>Showing {filterMode.toLowerCase()} projects</Text>

      <View style={styles.projectsList}>
        {displayProjects.map((project, index) => (
          <ProjectCard
            key={`${project.id}-${index}`}
            active={openedProjectId === project.id || project.sourceProject?.id === props.selectedProjectId}
            expanded={expandedProjectId === project.id}
            onArchive={() => archiveProject(project.id)}
            onDelete={() => deleteProject(project.id)}
            onMore={() => setExpandedProjectId((current) => current === project.id ? null : project.id)}
            onOpen={() => openProject(project)}
            layout={projectLayout}
            project={project}
          />
        ))}
        {displayProjects.length === 0 ? (
          <View style={styles.projectsEmptyState}>
            <Ionicons name="folder-open-outline" color="#8E8AA3" size={24} />
            <Text style={styles.projectsEmptyText}>No projects match this view.</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function AIChatPage(props: {
  agentRequesting: boolean;
  chatMessages: ChatMessage[];
  onStart: () => void;
  selectedChatId: string | null;
  selectedFileName: string;
  setSelectedChatId: (chatId: string | null) => void;
  setTaskText: (value: string) => void;
  taskText: string;
}) {
  const hasConversation = props.chatMessages.some((message) => message.id !== "welcome");
  const activeChat = previousChats.find((chat) => chat.id === props.selectedChatId);

  if (!props.selectedChatId) {
    return (
      <View style={styles.chatLandingScreen}>
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(104, 32, 255, 0.28)", "rgba(10, 8, 27, 0.22)", "rgba(2, 3, 12, 0)"]}
          locations={[0, 0.48, 1]}
          start={{ x: 1, y: 0.1 }}
          end={{ x: 0.12, y: 0.72 }}
          style={styles.chatLandingLight}
        />

        <View style={styles.chatLandingHero}>
          <View style={styles.chatLandingCopy}>
            <Text style={styles.chatLandingKicker}>AI Chat</Text>
            <Text style={styles.chatLandingTitle}>Build with AI</Text>
            <Text style={styles.chatLandingSubtitle}>Start a new chat or continue where you left off.</Text>
          </View>
          <ChatLandingArt />
        </View>

        <Pressable style={styles.chatLandingPrimary} onPress={() => props.setSelectedChatId("new-chat")}>
          <LinearGradient
            colors={["#7D22EA", "#7B25DC", "#5B18BC"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.chatLandingPrimaryGradient}
          >
            <Ionicons name="sparkles-outline" color={colors.text} size={24} />
            <View style={styles.chatLandingPrimaryCopy}>
              <Text style={styles.chatLandingPrimaryTitle}>Start new chat</Text>
              <Text style={styles.chatLandingPrimaryMeta}>Open a fresh AI workspace</Text>
            </View>
            <Ionicons name="arrow-forward" color={colors.text} size={26} />
          </LinearGradient>
        </Pressable>

        <Pressable style={styles.chatResumeCard} onPress={() => props.setSelectedChatId(previousChats[0].id)}>
          <View style={styles.chatResumeIcon}>
            <Ionicons name="chatbubble-ellipses-outline" color="#55F09C" size={24} />
          </View>
          <View style={styles.chatResumeCopy}>
            <Text style={styles.chatResumeLabel}>Resume last session</Text>
            <Text numberOfLines={1} style={styles.chatResumeTitle}>{previousChats[0].title}</Text>
            <View style={styles.chatPreviousMetaRow}>
              <View style={[styles.chatStatusDot, styles.chatStatusDotRunning]} />
              <Text style={styles.chatResumeMeta}>Running</Text>
              <Text style={styles.chatResumeMeta}>·</Text>
              <Text style={styles.chatResumeMeta}>{previousChats[0].time}</Text>
            </View>
          </View>
          <View style={styles.chatResumeArrow}>
            <Ionicons name="arrow-forward" color="#CFC7E6" size={24} />
          </View>
          <View style={styles.chatResumeProgressTrack}>
            <LinearGradient
              colors={["#8A34FF", "#B13DFF"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.chatResumeProgressFill}
            />
          </View>
        </Pressable>

        <View style={styles.chatRecentPanel}>
          <View style={styles.chatRecentHeader}>
            <Text style={styles.chatRecentTitle}>Recent chats</Text>
            <Text style={styles.chatRecentBadge}>{previousChats.length} saved</Text>
          </View>
          <View style={styles.chatRecentList}>
            {previousChats.map((chat, index) => (
              <ChatLandingRow
                key={chat.id}
                active={index === 0}
                chat={chat}
                onOpen={() => props.setSelectedChatId(chat.id)}
              />
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.chatPage, styles.chatActivePage]}>
      <View style={styles.chatActiveHeader}>
        <Pressable style={styles.chatBackButton} onPress={() => props.setSelectedChatId(null)}>
          <Ionicons name="chevron-back" color={colors.text} size={22} />
        </Pressable>
        <View style={styles.chatActiveHeaderCopy}>
          <Text numberOfLines={1} style={styles.chatActiveTitle}>{activeChat?.title ?? "New chat"}</Text>
          <View style={styles.chatPreviousMetaRow}>
            <View style={[styles.chatStatusDot, activeChat?.running ? styles.chatStatusDotRunning : null]} />
            <Text style={styles.chatActiveMeta}>{activeChat?.running ? "Running" : props.selectedChatId === "new-chat" ? "New AI chat" : "Not running"}</Text>
          </View>
        </View>
      </View>
      <View style={styles.chatAssistantPanel}>
        {hasConversation ? (
          <ScrollView
            contentContainerStyle={styles.chatMessageListContent}
            showsVerticalScrollIndicator={false}
            style={styles.chatMessageList}
          >
            {props.chatMessages.map((message) => <MessageBubble key={message.id} message={message} />)}
            {props.agentRequesting ? <LoadingBubble /> : null}
          </ScrollView>
        ) : (
          <View style={styles.chatWelcomeBlock}>
            <View style={styles.chatOrb}>
              <LinearGradient
                colors={["#E044FF", "#7433FF", "#0B4DFF"]}
                start={{ x: 0.15, y: 0.1 }}
                end={{ x: 0.92, y: 0.9 }}
                style={styles.chatOrbGradient}
              >
                <View style={styles.chatOrbFace}>
                  <View style={styles.chatOrbEye} />
                  <View style={styles.chatOrbEye} />
                </View>
              </LinearGradient>
            </View>

            <Text style={styles.chatWelcomeTitle}>Hi Ellis, how can I help?</Text>
            <Text style={styles.chatWelcomeSubtitle}>Ask me to modify files, debug issues, add features, and more.</Text>

            <View style={styles.chatSuggestionGrid}>
              {chatSuggestions.map((suggestion) => (
                <Pressable
                  key={suggestion.text}
                  style={styles.chatSuggestionCard}
                  onPress={() => props.setTaskText(suggestion.text)}
                >
                  <View style={[styles.chatSuggestionIcon, { borderColor: `${suggestion.color}66`, backgroundColor: `${suggestion.color}20` }]}>
                    <Ionicons name={suggestion.icon} color={suggestion.color} size={20} />
                  </View>
                  <Text numberOfLines={2} style={styles.chatSuggestionText}>{suggestion.text}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={styles.chatComposer}>
          <TextInput
            value={props.taskText}
            onChangeText={props.setTaskText}
            placeholder="Ask anything about your project..."
            placeholderTextColor="#8F8A9E"
            multiline
            style={styles.chatComposerInput}
          />
          <View style={styles.chatComposerBottom}>
            <View style={styles.chatComposerTools}>
              <Pressable style={styles.chatComposerTool}>
                <Ionicons name="attach-outline" color="#B9B5C8" size={26} />
              </Pressable>
              <Pressable style={styles.chatComposerTool}>
                <Ionicons name="folder-outline" color="#B9B5C8" size={27} />
              </Pressable>
            </View>
            <Pressable style={styles.chatSendButton} onPress={props.onStart}>
              <LinearGradient
                colors={["#8E3CFF", "#5D24D8"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.chatSendGradient}
              >
                <Ionicons name={props.agentRequesting ? "hourglass-outline" : "arrow-up"} color={colors.text} size={32} />
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function CommunityPage() {
  return (
    <View style={styles.communityScreen}>
      <View style={styles.communityHero}>
        <View style={styles.communityHeroCopy}>
          <Text style={styles.communityHeroTitle}>Community</Text>
          <Text style={styles.communityHeroSubtitle}>See what other builders are making.</Text>
        </View>
      </View>

      <View style={styles.communityTabs}>
        {["Recent", "Popular", "Featured"].map((filter, index) => (
          <Pressable key={filter} style={[styles.communityTab, index === 0 ? styles.communityTabActive : null]}>
            <Text style={[styles.communityTabText, index === 0 ? styles.communityTabTextActive : null]}>{filter}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.communitySearchRow}>
        <View style={styles.communitySearchBar}>
          <Ionicons name="search-outline" color="#8E8AA3" size={22} />
          <TextInput
            editable={false}
            placeholder="Search projects, builders, tags..."
            placeholderTextColor="#8E8AA3"
            style={styles.communitySearchInput}
          />
        </View>
        <Pressable style={styles.communityFilterButton}>
          <Ionicons name="options-outline" color="#B4B1C9" size={22} />
        </Pressable>
      </View>

      <View style={styles.communityFeed}>
        {communityPosts.map((post) => <CommunityPostCard key={post.title} post={post} />)}
      </View>
    </View>
  );
}

function CommunityPostCard({ post }: { post: typeof communityPosts[number] }) {
  const green = post.tag === "Recent";
  const blue = post.tag === "Featured";
  const tagStyle = green ? styles.communityPostBadgeGreen : blue ? styles.communityPostBadgeBlue : styles.communityPostBadgePurple;

  return (
    <View style={styles.communityPostCard}>
      <View style={styles.communityPostLeft}>
        <View style={[styles.communityAvatar, { backgroundColor: `${post.accent}2A` }]}>
          <Text style={[styles.communityAvatarText, { color: post.accent }]}>{post.user.slice(0, 1)}</Text>
        </View>

        <View style={styles.communityPostBody}>
          <View>
            <Text style={styles.communityPostUser}>{post.user}</Text>
            <Text style={styles.communityPostTime}>{post.time}</Text>
          </View>

          <View>
            <Text style={styles.communityPostTitle}>{post.title}</Text>
            <Text style={styles.communityPostDescription}>{post.description}</Text>
          </View>

          <View style={styles.communityPostTags}>
            {post.tags.map((tag) => (
              <Text key={tag} style={[
                styles.communityPostTag,
                green ? styles.communityPostTagGreen : blue ? styles.communityPostTagBlue : styles.communityPostTagPurple
              ]}>{tag}</Text>
            ))}
          </View>

          <View style={styles.communityPostStats}>
            <View style={styles.communityPostStat}>
              <Ionicons name="heart-outline" color="#B7B4C8" size={18} />
              <Text style={styles.communityPostStatText}>{post.likes}</Text>
            </View>
            <View style={styles.communityPostStat}>
              <Ionicons name="chatbubble-outline" color="#B7B4C8" size={18} />
              <Text style={styles.communityPostStatText}>{post.comments}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.communityPostSide}>
        <Text style={[styles.communityPostBadge, tagStyle]}>{post.tag}</Text>
        <Pressable style={styles.communityBookmark}>
          <Ionicons name="bookmark-outline" color="#D7D3EA" size={18} />
        </Pressable>
      </View>
    </View>
  );
}

function CommunityPreview({ tone, type }: { tone: string; type: typeof communityPosts[number]["preview"] }) {
  return (
    <View style={[styles.communityPreview, { borderColor: `${tone}66` }]}>
      {type === "invoice" ? (
        <>
          <View style={styles.communityPreviewSidebar}>
            {Array.from({ length: 7 }).map((_, index) => <View key={index} style={[styles.communityPreviewSideDot, index === 1 ? { backgroundColor: tone } : null]} />)}
          </View>
          <View style={styles.communityPreviewContent}>
            <Text style={styles.communityPreviewTiny}>Invoices</Text>
            <Text style={styles.communityPreviewValue}>$24,540</Text>
            <View style={styles.communityBarChart}>
              {[8, 14, 11, 21, 13, 18, 17, 23, 28].map((height, index) => (
                <View key={index} style={[styles.communityChartBar, { height, backgroundColor: index > 6 ? tone : `${tone}B8` }]} />
              ))}
            </View>
            <View style={styles.communityPreviewRows}>
              <View style={styles.communityPreviewRow} />
              <View style={styles.communityPreviewRow} />
              <View style={styles.communityPreviewRowShort} />
            </View>
          </View>
        </>
      ) : null}

      {type === "habit" ? (
        <>
          <View style={styles.communityHabitCard}>
            <View style={[styles.communityHabitRing, { borderColor: tone }]}>
              <Text style={styles.communityHabitScore}>8/10</Text>
            </View>
            <Text style={[styles.communityHabitText, { color: tone }]}>Great job!</Text>
          </View>
          <View style={styles.communityCalendar}>
            {Array.from({ length: 21 }).map((_, index) => (
              <View key={index} style={[styles.communityCalendarDot, index > 6 ? { backgroundColor: `${tone}88` } : null]} />
            ))}
          </View>
        </>
      ) : null}

      {type === "analytics" ? (
        <View style={styles.communityAnalytics}>
          <Text style={styles.communityPreviewTiny}>Overview</Text>
          <View style={styles.communityMetricRow}>
            {["12.4K", "$28.9K", "2.4%"].map((metric, index) => (
              <View key={metric} style={styles.communityMetricCard}>
                <Text style={styles.communityMetricValue}>{metric}</Text>
                <Text style={[styles.communityMetricDelta, index === 2 ? { color: "#FF6480" } : null]}>{index === 2 ? "-3.1%" : "+12.5%"}</Text>
              </View>
            ))}
          </View>
          <View style={styles.communityLineChart}>
            {[12, 24, 17, 32, 21, 35, 27, 44, 33, 50, 41, 58].map((top, index) => (
              <View key={index} style={[styles.communityLinePoint, { left: `${index * 8}%`, top }]} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ProfilePage(props: {
  activeTab: SettingsTab;
  email: string;
  machineName: string;
  onTabChange: (tab: SettingsTab) => void;
  projectCount: number;
  selectedModel: string;
}) {
  const tabs: Array<{ key: SettingsTab; icon: keyof typeof Ionicons.glyphMap; label: string }> = [
    { key: "profile", icon: "person-circle-outline", label: "Profile" },
    { key: "billing", icon: "card-outline", label: "Billing" },
    { key: "preferences", icon: "options-outline", label: "Preferences" },
    { key: "security", icon: "lock-closed-outline", label: "Security" }
  ];
  const projectCount = Math.max(props.projectCount, 7);
  const machineName = props.machineName === "Vibyra Desktop" ? "ellis-Z270P-D3" : props.machineName;

  return (
    <View style={styles.profileScreen}>
      <View style={styles.profileHeader}>
        <Text style={styles.profilePageTitle}>Profile / Settings</Text>
        <Text style={styles.profilePageSubtitle}>Manage your account, preferences, and security.</Text>
      </View>

      <View style={styles.profileTabs}>
        {tabs.map((tab) => {
          const active = tab.key === props.activeTab;
          return (
            <Pressable key={tab.key} onPress={() => props.onTabChange(tab.key)} style={[styles.profileTab, active ? styles.profileTabActive : null]}>
              <Ionicons name={tab.icon} color={active ? "#DDFCEB" : "#BAB5CA"} size={18} />
              <Text style={[styles.profileTabText, active ? styles.profileTabTextActive : null]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.profileSummaryCard}>
        <View style={styles.profileSummaryTop}>
          <View style={styles.profileAvatarLarge}>
            <Text style={styles.profileAvatarLargeText}>B</Text>
          </View>
          <View style={styles.profileSummaryCopy}>
            <Text style={styles.profileSummaryName}>Builder</Text>
            <Text style={styles.profileSummaryEmail}>{props.email}</Text>
            <View style={styles.profileConnectionRow}>
              <View style={styles.profileConnectionDot} />
              <Text style={styles.profileConnectionText}>Connected to {machineName}</Text>
            </View>
          </View>
          <Pressable style={styles.profileEditButton}>
            <Ionicons name="pencil-outline" color={colors.text} size={17} />
            <Text style={styles.profileEditText}>Edit Profile</Text>
          </Pressable>
        </View>

        <View style={styles.profileStatsPanel}>
          <ProfileStat icon="folder-outline" value={`${projectCount}`} label="Projects" />
          <ProfileStat icon="flash-outline" value="1,240" label="Tokens left" />
          <ProfileStat icon="pulse-outline" value="2" label="AI tasks running" last />
        </View>
      </View>

      <ProfileSettingsGroup
        title="Account"
        rows={[
          { icon: "mail-outline", label: "Email", value: props.email },
          { icon: "desktop-outline", label: "Connected PC", value: machineName, badge: "Active" },
          { icon: "diamond-outline", label: "Plan", value: "Starter Plan" }
        ]}
      />

      <ProfileSettingsGroup
        title="Preferences"
        rows={[
          { icon: "color-palette-outline", label: "Appearance", value: "Dark" },
          { icon: "notifications-outline", label: "Notifications", value: "Email updates, project activity" }
        ]}
      />

      <ProfileSettingsGroup
        title="Security"
        rows={[
          { icon: "lock-closed-outline", label: "Password", value: "Last changed 14 days ago" },
          { icon: "shield-outline", label: "Active Sessions", value: "2 active sessions" }
        ]}
      />

      <ProfileSettingsGroup
        danger
        title="Danger Zone"
        rows={[
          { icon: "trash-outline", label: "Log out", value: "Sign out from this account" },
          { icon: "warning-outline", label: "Delete Account", value: "Permanently delete your account and data" }
        ]}
      />
    </View>
  );
}

function ProfileStat({ icon, label, last, value }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  last?: boolean;
  value: string;
}) {
  return (
    <View style={[styles.profileStat, last ? styles.profileStatLast : null]}>
      <View style={styles.profileStatIcon}>
        <Ionicons name={icon} color="#D070FF" size={22} />
      </View>
      <View>
        <Text style={styles.profileStatValue}>{value}</Text>
        <Text style={styles.profileStatLabel}>{label}</Text>
      </View>
    </View>
  );
}

function ProfileSettingsGroup({ danger, rows, title }: {
  danger?: boolean;
  rows: Array<{ badge?: string; icon: keyof typeof Ionicons.glyphMap; label: string; value: string }>;
  title: string;
}) {
  return (
    <View style={styles.profileGroup}>
      <Text style={[styles.profileGroupTitle, danger ? styles.profileGroupDangerTitle : null]}>{title}</Text>
      {rows.map((row, index) => (
        <View key={row.label} style={[styles.profileRow, index === rows.length - 1 ? styles.profileRowLast : null]}>
          <View style={[styles.profileRowIcon, danger ? styles.profileRowIconDanger : null]}>
            <Ionicons name={row.icon} color={danger ? "#FF5D5D" : "#C8C4D8"} size={23} />
          </View>
          <View style={styles.profileRowCopy}>
            <Text style={styles.profileRowLabel}>{row.label}</Text>
            <Text style={styles.profileRowValue}>{row.value}</Text>
          </View>
          {row.badge ? <Text style={styles.profileRowBadge}>{row.badge}</Text> : null}
          <Ionicons name="chevron-forward" color="#B8B4C8" size={21} />
        </View>
      ))}
    </View>
  );
}

function PageHeader({ actionIcon, actionLabel, onAction, subtitle, title }: {
  actionIcon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
  subtitle?: string;
  title: string;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderCopy}>
        <Text style={styles.pageTitle}>{title}</Text>
        {subtitle ? <Text style={styles.bodyText}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable style={styles.primaryButton} onPress={onAction}>
          <Ionicons name={actionIcon ?? "add"} color={colors.text} size={18} />
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SectionCard({ action, children, onAction, title }: {
  action?: string;
  children: React.ReactNode;
  onAction?: () => void;
  title: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action ? (
          <Pressable onPress={onAction}>
            <Text style={styles.cardAction}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function CompactRow({ icon, meta, title, tone = "default" }: {
  icon: keyof typeof Ionicons.glyphMap;
  meta: string;
  title: string;
  tone?: "default" | "green";
}) {
  return (
    <View style={styles.compactRow}>
      <View style={[styles.rowIcon, tone === "green" ? styles.rowIconGreen : null]}>
        <Ionicons name={icon} color={tone === "green" ? "#A7F3D0" : colors.muted} size={18} />
      </View>
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.projectMeta}>{meta}</Text>
      </View>
    </View>
  );
}

function ProjectCard({ active, expanded, layout, onArchive, onDelete, onMore, onOpen, project }: {
  active: boolean;
  expanded: boolean;
  layout: ProjectLayout;
  onArchive: () => void;
  onDelete: () => void;
  onMore: () => void;
  onOpen: () => void;
  project: ProjectDisplay;
}) {
  const status = project.status;
  const completed = status === "Completed";
  const draft = status === "Draft";
  const archived = status === "Archived";
  const projectAccent = active ? "#59E8A0" : completed ? "#BE62FF" : archived ? "#AAA6BC" : "#DAD6F6";
  const titleDot = active ? "#3CD783" : completed ? "#4C2D84" : archived ? "#6F6A80" : "#373B52";

  return (
    <View style={[styles.projectCard, layout.cardStyle, active ? styles.projectCardActive : null]}>
      <View style={[styles.projectCardMain, { gap: layout.mainGap }]}>
        <View style={[styles.projectIcon, layout.iconBoxStyle, active ? styles.projectIconActive : completed ? styles.projectIconCompleted : null]}>
          <Ionicons name="folder-open-outline" color={projectAccent} size={layout.folderIconSize} />
        </View>
        <View style={styles.projectCardCopy}>
          <View style={styles.projectTitleRow}>
            <Text numberOfLines={1} style={styles.projectName}>{project.name}</Text>
            <View style={[styles.projectTitleDot, { backgroundColor: titleDot }]} />
          </View>
          <Text numberOfLines={1} style={styles.projectMeta}>{project.path}</Text>
          <View style={styles.projectStackRow}>
            <View style={styles.projectStackDot} />
            <Text numberOfLines={1} style={styles.projectStack}>{project.stack}</Text>
          </View>
        </View>
        <View style={styles.projectCardRight}>
          <Text style={[
            styles.projectStatusPill,
            layout.statusStyle,
            active ? styles.projectStatusActive : null,
            draft ? styles.projectStatusDraft : null,
            completed ? styles.projectStatusCompleted : null,
            archived ? styles.projectStatusArchived : null
          ]}>{status}</Text>
          <Pressable hitSlop={8} onPress={onMore} style={styles.projectMoreButton}>
            <Ionicons name="ellipsis-vertical" color={expanded ? "#DAD6F6" : "#858197"} size={18} />
          </Pressable>
        </View>
      </View>

      {expanded ? (
        <View style={styles.projectQuickPanel}>
          <Text numberOfLines={1} style={styles.projectQuickText}>{project.path}</Text>
          <Pressable style={styles.projectQuickAction} onPress={onOpen}>
            <Ionicons name="open-outline" color="#DAD6F6" size={15} />
            <Text style={styles.projectQuickActionText}>Open</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.projectDivider} />

      <View style={[styles.projectCardFooter, layout.footerStyle]}>
        <View style={layout.footerDetailsStyle}>
          <View style={styles.projectFooterMeta}>
            <Ionicons name="calendar-outline" color="#AAA6BC" size={15} />
            <Text numberOfLines={1} style={styles.projectFooterText}>{project.updated}</Text>
          </View>
          <View style={styles.projectFooterMeta}>
            <Ionicons name="git-branch-outline" color="#AAA6BC" size={15} />
            <Text numberOfLines={1} style={styles.projectFooterText}>{project.branch}</Text>
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
          <Pressable style={[styles.projectIconButton, { height: layout.actionButtonSize, width: layout.actionButtonSize }]} onPress={onArchive}>
            <Ionicons name={archived ? "arrow-up-circle-outline" : "archive-outline"} color="#BEB9D4" size={18} />
          </Pressable>
          <Pressable style={[styles.projectIconButton, { height: layout.actionButtonSize, width: layout.actionButtonSize }]} onPress={onDelete}>
            <Ionicons name="trash-outline" color="#FF6480" size={18} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ChatPreviewCard({ active, chat, onOpen }: {
  active: boolean;
  chat: typeof previousChats[number];
  onOpen: () => void;
}) {
  const status = chat.running ? "Running" : "Not running";

  return (
    <Pressable style={[styles.projectCard, active ? styles.projectCardActive : null]} onPress={onOpen}>
      <View style={styles.projectCardMain}>
        <View style={[styles.projectIcon, active ? styles.projectIconActive : chat.running ? styles.chatPreviewIconRunning : null]}>
          <Ionicons name={chat.icon} color={chat.running ? "#59E8A0" : active ? "#59E8A0" : "#DAD6F6"} size={24} />
        </View>
        <View style={styles.projectCardCopy}>
          <View style={styles.projectTitleRow}>
            <Text numberOfLines={1} style={styles.projectName}>{chat.title}</Text>
            <View style={[styles.projectTitleDot, { backgroundColor: chat.running ? "#3CD783" : "#373B52" }]} />
          </View>
          <Text numberOfLines={1} style={styles.projectMeta}>{chat.meta}</Text>
          <View style={styles.projectStackRow}>
            <View style={styles.projectStackDot} />
            <Text numberOfLines={1} style={styles.projectStack}>{chat.running ? "Agent is currently working in this chat" : "Ready to continue"}</Text>
          </View>
        </View>
        <View style={styles.projectCardRight}>
          <Text style={[styles.projectStatusPill, active || chat.running ? styles.projectStatusActive : null]}>{status}</Text>
          <Ionicons name="chevron-forward" color="#A9A6BE" size={21} />
        </View>
      </View>

      <View style={styles.projectDivider} />

      <View style={styles.projectCardFooter}>
        <View style={styles.projectFooterDetails}>
          <View style={styles.projectFooterMeta}>
            <Ionicons name="chatbubble-ellipses-outline" color="#AAA6BC" size={15} />
            <Text numberOfLines={1} style={styles.projectFooterText}>AI conversation</Text>
          </View>
          <View style={styles.projectFooterMeta}>
            <Ionicons name={chat.running ? "pulse-outline" : "pause-circle-outline"} color="#AAA6BC" size={15} />
            <Text numberOfLines={1} style={styles.projectFooterText}>{status}</Text>
          </View>
        </View>
        <View style={styles.projectFooterActions}>
          <View style={styles.projectOpenButton}>
            <LinearGradient
              colors={["#6E31FF", "#5624E6"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.projectOpenGradient}
            >
              <Text style={styles.projectOpenText}>Open</Text>
              <Ionicons name="arrow-forward" color={colors.text} size={17} />
            </LinearGradient>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function ChatLandingArt() {
  return (
    <View pointerEvents="none" style={styles.chatLandingArt}>
      <Image resizeMode="contain" source={chatBuildAiHero} style={styles.chatLandingArtImage} />
    </View>
  );
}

function ChatLandingRow({ active, chat, onOpen }: {
  active: boolean;
  chat: typeof previousChats[number];
  onOpen: () => void;
}) {
  return (
    <Pressable style={[styles.chatRecentRow, active ? styles.chatRecentRowActive : null]} onPress={onOpen}>
      {active ? <View style={styles.chatRecentActiveDot} /> : null}
      <View style={[styles.chatRecentIcon, chat.running ? styles.chatRecentIconRunning : null]}>
        <Ionicons name={chat.icon} color={chat.running ? "#55F09C" : "#BDB7D6"} size={21} />
      </View>
      <View style={styles.chatRecentCopy}>
        <Text numberOfLines={1} style={styles.chatRecentRowTitle}>{chat.title}</Text>
        <View style={styles.chatRecentMetaRow}>
          <View style={[styles.chatStatusDot, chat.running ? styles.chatStatusDotRunning : null]} />
          <Text style={[styles.chatRecentMeta, chat.running ? styles.chatRecentMetaRunning : null]}>{chat.running ? "Running" : "Not running"}</Text>
          <Text style={styles.chatRecentMeta}>·</Text>
          <Text numberOfLines={1} style={styles.chatRecentMeta}>{chat.meta}</Text>
          <Text style={styles.chatRecentMeta}>·</Text>
          <Text numberOfLines={1} style={styles.chatRecentMeta}>{chat.detail}</Text>
        </View>
      </View>
      <Text style={styles.chatRecentTime}>{chat.time}</Text>
      <Ionicons name="chevron-forward" color="#B8B0D0" size={24} />
    </Pressable>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const user = message.role === "user";
  return (
    <View style={[styles.messageBubble, user ? styles.messageBubbleUser : styles.messageBubbleAssistant]}>
      <Text style={styles.messageText}>{message.text}</Text>
    </View>
  );
}

function LoadingBubble() {
  return (
    <View style={[styles.messageBubble, styles.messageBubbleAssistant]}>
      <Text style={styles.messageText}>Thinking...</Text>
    </View>
  );
}

function CommunityMiniCard({ post }: { post: typeof communityPosts[number] }) {
  return (
    <View style={styles.communityMiniCard}>
      <Text style={styles.statusLabel}>{post.tag}</Text>
      <Text style={styles.postTitle}>{post.title}</Text>
      <Text style={styles.projectMeta}>{post.user} · {post.likes} likes · {post.comments} comments</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function titleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    backgroundColor: "rgba(167, 243, 208, 0.12)",
    borderRadius: 8,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  avatarText: {
    color: "#DDFCEB",
    fontSize: 17,
    fontWeight: "900"
  },
  bodyText: {
    color: "#B6B3C6",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 5,
    textAlign: "center"
  },
  card: {
    backgroundColor: "#101219",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 280,
    gap: 12,
    padding: 16
  },
  cardAction: {
    color: "#A7F3D0",
    fontSize: 13,
    fontWeight: "900"
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  chatInput: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    maxHeight: 120,
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 10,
    textAlignVertical: "top"
  },
  chatArtBubble: {
    alignItems: "center",
    borderColor: "rgba(190, 97, 255, 0.9)",
    borderRadius: 999,
    borderWidth: 2,
    height: 82,
    justifyContent: "center",
    left: 42,
    position: "absolute",
    shadowColor: "#B85DFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 17,
    top: 48,
    width: 82,
    zIndex: 4
  },
  chatArtBubbleEye: {
    backgroundColor: "#F5E9FF",
    borderRadius: 999,
    height: 15,
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    width: 15
  },
  chatArtBubbleFace: {
    flexDirection: "row",
    gap: 16
  },
  chatArtBubbleTail: {
    backgroundColor: "#2A1160",
    borderBottomColor: "rgba(190, 97, 255, 0.9)",
    borderBottomWidth: 2,
    borderLeftColor: "rgba(190, 97, 255, 0.9)",
    borderLeftWidth: 2,
    borderRadius: 8,
    bottom: 36,
    height: 22,
    left: 45,
    position: "absolute",
    transform: [{ rotate: "-22deg" }],
    width: 27,
    zIndex: 3
  },
  chatArtGlowFloor: {
    backgroundColor: "rgba(129, 42, 255, 0.32)",
    borderRadius: 999,
    bottom: 10,
    height: 20,
    left: 11,
    position: "absolute",
    shadowColor: "#8A34FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 25,
    transform: [{ scaleX: 3 }],
    width: 78
  },
  chatArtLineLong: {
    backgroundColor: "rgba(150, 67, 255, 0.72)",
    borderRadius: 999,
    height: 5,
    marginTop: 11,
    width: 54
  },
  chatArtLineMid: {
    backgroundColor: "rgba(99, 43, 200, 0.72)",
    borderRadius: 999,
    height: 4,
    marginTop: 8,
    width: 45
  },
  chatArtLineShort: {
    backgroundColor: "rgba(67, 31, 145, 0.78)",
    borderRadius: 999,
    height: 4,
    marginTop: 8,
    width: 34
  },
  chatArtPanel: {
    backgroundColor: "rgba(26, 12, 70, 0.5)",
    borderColor: "rgba(156, 50, 255, 0.72)",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 13,
    position: "absolute",
    shadowColor: "#8A34FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16
  },
  chatArtPanelBack: {
    height: 94,
    right: 28,
    top: 22,
    width: 94,
    zIndex: 1
  },
  chatArtPanelDot: {
    backgroundColor: "rgba(92, 43, 178, 0.84)",
    borderRadius: 999,
    height: 15,
    left: 14,
    position: "absolute",
    top: 23,
    width: 15
  },
  chatArtPanelFront: {
    bottom: 27,
    height: 65,
    right: 11,
    width: 80,
    zIndex: 2
  },
  chatArtStarLarge: {
    backgroundColor: "#C179FF",
    height: 10,
    left: 32,
    position: "absolute",
    top: 33,
    transform: [{ rotate: "45deg" }],
    width: 10
  },
  chatArtStarSmall: {
    backgroundColor: "#9A4DFF",
    height: 6,
    position: "absolute",
    right: 5,
    top: 55,
    transform: [{ rotate: "45deg" }],
    width: 6
  },
  chatAssistantPanel: {
    backgroundColor: "rgba(11, 12, 28, 0.92)",
    borderColor: "rgba(134, 70, 211, 0.62)",
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 12,
    minHeight: 0,
    overflow: "hidden",
    padding: 12
  },
  chatComposer: {
    backgroundColor: "rgba(20, 22, 36, 0.82)",
    borderColor: "rgba(122, 67, 198, 0.48)",
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 96,
    padding: 12
  },
  chatComposerBottom: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10
  },
  chatComposerInput: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
    maxHeight: 70,
    minHeight: 26,
    padding: 0,
    textAlignVertical: "top"
  },
  chatComposerTool: {
    alignItems: "center",
    height: 30,
    justifyContent: "center",
    width: 30
  },
  chatComposerTools: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  chatActiveContent: {
    paddingBottom: Platform.OS === "ios" ? 16 : 12,
    paddingHorizontal: 10,
    paddingTop: 8
  },
  chatActiveHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 46
  },
  chatActiveHeaderCopy: {
    flex: 1,
    minWidth: 0
  },
  chatActiveMeta: {
    color: "#AAA6BC",
    fontSize: 12,
    fontWeight: "900"
  },
  chatActivePage: {
    gap: 8
  },
  chatActiveTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22
  },
  chatBackButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  chatContent: {
    paddingBottom: Platform.OS === "ios" ? 96 : 90,
    paddingHorizontal: 14,
    paddingTop: 4
  },
  chatHistoryCard: {
    backgroundColor: "rgba(13, 17, 29, 0.9)",
    borderColor: "rgba(78, 79, 102, 0.34)",
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    height: 82,
    padding: 10,
    width: 132
  },
  chatHistoryCardActive: {
    backgroundColor: "rgba(31, 20, 54, 0.96)",
    borderColor: "#B64FFF"
  },
  chatHistoryCardMeta: {
    color: "#A9A5B8",
    fontSize: 11,
    fontWeight: "900"
  },
  chatHistoryCardMetaActive: {
    color: "#B64FFF"
  },
  chatHistoryCardTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 16
  },
  chatHistoryHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2
  },
  chatHistoryIcon: {
    alignItems: "center",
    backgroundColor: "rgba(55, 56, 76, 0.62)",
    borderRadius: 8,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  chatHistoryIconActive: {
    backgroundColor: "rgba(96, 42, 168, 0.58)"
  },
  chatHistoryRail: {
    gap: 9,
    paddingHorizontal: 2,
    paddingRight: 14
  },
  chatHistoryTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  chatLauncherCopy: {
    flex: 1,
    minWidth: 0
  },
  chatLauncherHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  chatLauncherKicker: {
    color: "#B64FFF",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  chatLauncherTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 29,
    marginTop: 3
  },
  chatList: {
    backgroundColor: "#101219",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  chatListHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  chatPage: {
    flex: 1,
    flexDirection: "column",
    gap: 10,
    minHeight: "100%",
    width: "100%"
  },
  chatNewButton: {
    alignItems: "center",
    borderColor: "#8F35FF",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 12
  },
  chatNewButtonText: {
    color: "#B64FFF",
    fontSize: 13,
    fontWeight: "900"
  },
  chatLandingArt: {
    height: 174,
    position: "absolute",
    right: -20,
    top: 4,
    width: 198
  },
  chatLandingArtImage: {
    height: "100%",
    width: "100%"
  },
  chatLandingCopy: {
    maxWidth: 235,
    minWidth: 0,
    paddingTop: 14,
    zIndex: 2
  },
  chatLandingHero: {
    minHeight: 188,
    position: "relative"
  },
  chatLandingKicker: {
    color: "#B934FF",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  chatLandingLight: {
    height: 260,
    position: "absolute",
    right: -48,
    top: 26,
    width: 250
  },
  chatLandingPrimary: {
    borderColor: "rgba(195, 75, 255, 0.8)",
    borderRadius: 17,
    borderWidth: 2,
    marginTop: -6,
    overflow: "hidden",
    shadowColor: "#9B34FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.72,
    shadowRadius: 18
  },
  chatLandingPrimaryCopy: {
    flex: 1,
    minWidth: 0
  },
  chatLandingPrimaryGradient: {
    alignItems: "center",
    flexDirection: "row",
    gap: 13,
    minHeight: 66,
    paddingHorizontal: 17
  },
  chatLandingPrimaryMeta: {
    color: "#D7C6FF",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 3
  },
  chatLandingPrimaryTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22
  },
  chatLandingScreen: {
    flex: 1,
    gap: 9,
    overflow: "hidden",
    position: "relative",
    width: "100%"
  },
  chatLandingSubtitle: {
    color: "#AAA5BB",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 23,
    marginTop: 10,
    maxWidth: 205
  },
  chatLandingTitle: {
    color: colors.text,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 41,
    marginTop: 10,
    textShadowColor: "rgba(255, 255, 255, 0.24)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4
  },
  chatHeroOrb: {
    borderRadius: 999,
    height: 118,
    shadowColor: "#8B35FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.72,
    shadowRadius: 26,
    width: 118
  },
  chatHeroVisual: {
    alignItems: "center",
    flexShrink: 0,
    height: 170,
    justifyContent: "center",
    marginRight: -2,
    maxWidth: 228,
    minWidth: 148,
    width: "46%"
  },
  chatPreviousCopy: {
    flex: 1,
    minWidth: 0
  },
  chatPreviousCount: {
    color: "#A9A5B8",
    fontSize: 12,
    fontWeight: "900"
  },
  chatPreviousHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  chatPreviousIcon: {
    alignItems: "center",
    backgroundColor: "rgba(55, 56, 76, 0.62)",
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 12,
    borderWidth: 1,
    height: 43,
    justifyContent: "center",
    width: 43
  },
  chatPreviousIconRunning: {
    backgroundColor: "rgba(58, 194, 115, 0.16)",
    borderColor: "rgba(112, 240, 162, 0.28)"
  },
  chatPreviousList: {
    gap: 10,
    paddingTop: 10
  },
  chatPreviousMeta: {
    color: "#A9A5B8",
    fontSize: 12,
    fontWeight: "800"
  },
  chatPreviousMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    marginTop: 4
  },
  chatPreviousPanel: {
    backgroundColor: "rgba(11, 12, 28, 0.72)",
    borderColor: "rgba(134, 70, 211, 0.24)",
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    minHeight: 0,
    padding: 13
  },
  chatPreviousRow: {
    alignItems: "center",
    backgroundColor: "rgba(17, 19, 33, 0.86)",
    borderColor: "rgba(111, 107, 132, 0.28)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    minHeight: 66,
    paddingHorizontal: 12
  },
  chatPreviousRowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19
  },
  chatPreviousTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  chatPreviewIconRunning: {
    backgroundColor: "rgba(43, 96, 79, 0.28)"
  },
  chatRecentActiveDot: {
    backgroundColor: "#2EDB78",
    borderRadius: 999,
    height: 8,
    left: -5,
    position: "absolute",
    shadowColor: "#2EDB78",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 8,
    top: 38,
    width: 8
  },
  chatRecentBadge: {
    backgroundColor: "rgba(111, 50, 191, 0.2)",
    borderColor: "rgba(141, 72, 235, 0.22)",
    borderRadius: 8,
    borderWidth: 1,
    color: "#B678FF",
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  chatRecentCopy: {
    flex: 1,
    minWidth: 0
  },
  chatRecentHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8
  },
  chatRecentIcon: {
    alignItems: "center",
    backgroundColor: "rgba(45, 42, 67, 0.68)",
    borderRadius: 11,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  chatRecentIconRunning: {
    backgroundColor: "rgba(33, 97, 66, 0.34)",
    borderColor: "rgba(57, 218, 119, 0.62)",
    borderWidth: 2
  },
  chatRecentList: {
    gap: 8
  },
  chatRecentMeta: {
    color: "#A5A0B7",
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 15
  },
  chatRecentMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    marginTop: 4
  },
  chatRecentMetaRunning: {
    color: "#55D98C",
    fontWeight: "900"
  },
  chatRecentPanel: {
    backgroundColor: "rgba(9, 10, 24, 0.78)",
    borderColor: "rgba(70, 52, 116, 0.72)",
    borderRadius: 18,
    borderWidth: 1,
    gap: 0,
    padding: 12,
    shadowColor: "#3D1F7B",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 18
  },
  chatRecentRow: {
    alignItems: "center",
    backgroundColor: "rgba(10, 12, 27, 0.86)",
    borderColor: "rgba(40, 39, 60, 0.72)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 66,
    paddingHorizontal: 11,
    position: "relative"
  },
  chatRecentRowActive: {
    backgroundColor: "rgba(10, 22, 28, 0.92)",
    borderColor: "rgba(50, 212, 128, 0.36)",
    shadowColor: "#2EDB78",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 16
  },
  chatRecentRowTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20
  },
  chatRecentTime: {
    color: "#A7A1B9",
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 4
  },
  chatRecentTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22
  },
  chatResumeArrow: {
    alignItems: "center",
    backgroundColor: "rgba(44, 29, 75, 0.62)",
    borderColor: "rgba(121, 74, 196, 0.58)",
    borderRadius: 11,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  chatResumeCard: {
    alignItems: "center",
    backgroundColor: "rgba(8, 11, 23, 0.88)",
    borderColor: "rgba(80, 59, 128, 0.72)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 90,
    overflow: "hidden",
    paddingBottom: 16,
    paddingHorizontal: 14,
    paddingTop: 14
  },
  chatResumeCopy: {
    flex: 1,
    minWidth: 0
  },
  chatResumeIcon: {
    alignItems: "center",
    backgroundColor: "rgba(19, 96, 67, 0.32)",
    borderRadius: 16,
    height: 52,
    justifyContent: "center",
    shadowColor: "#2EDB78",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
    width: 52
  },
  chatResumeLabel: {
    color: "#AAA5BB",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17
  },
  chatResumeMeta: {
    color: "#AAA5BB",
    fontSize: 13,
    fontWeight: "800"
  },
  chatResumeProgressFill: {
    borderRadius: 999,
    height: 4,
    width: "30%"
  },
  chatResumeProgressTrack: {
    backgroundColor: "rgba(34, 33, 53, 0.88)",
    borderRadius: 999,
    bottom: 9,
    height: 4,
    left: 14,
    overflow: "hidden",
    position: "absolute",
    right: 14
  },
  chatResumeTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22,
    marginTop: 4
  },
  chatPrimaryAction: {
    borderRadius: 16,
    flex: 1,
    minHeight: 76,
    minWidth: 0,
    overflow: "hidden",
    shadowColor: "#8F35FF",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 18
  },
  chatPrimaryActionCopy: {
    flex: 1,
    minWidth: 0
  },
  chatPrimaryActionGradient: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14
  },
  chatPrimaryActionMeta: {
    color: "rgba(255, 255, 255, 0.74)",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2
  },
  chatPrimaryActionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19
  },
  chatQuickActions: {
    flexDirection: "row",
    gap: 10
  },
  chatSecondaryAction: {
    alignItems: "center",
    backgroundColor: "rgba(18, 19, 34, 0.86)",
    borderColor: "rgba(156, 105, 255, 0.32)",
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 76,
    minWidth: 0,
    paddingHorizontal: 13
  },
  chatSecondaryActionMeta: {
    color: "#A9A5B8",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2
  },
  chatSecondaryActionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19
  },
  chatStatusDot: {
    backgroundColor: "#6F6A80",
    borderRadius: 999,
    height: 7,
    width: 7
  },
  chatStatusDotRunning: {
    backgroundColor: "#70F0A2"
  },
  chatOrb: {
    height: 82,
    width: 82
  },
  chatOrbEye: {
    backgroundColor: colors.text,
    borderRadius: 999,
    height: 9,
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 7,
    width: 9
  },
  chatOrbFace: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    height: "100%",
    justifyContent: "center"
  },
  chatOrbGradient: {
    borderRadius: 999,
    height: "100%",
    shadowColor: "#8B35FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 28,
    width: "100%"
  },
  chatSendButton: {
    borderRadius: 13,
    overflow: "hidden"
  },
  chatSendGradient: {
    alignItems: "center",
    height: 46,
    justifyContent: "center",
    width: 46
  },
  chatSuggestionCard: {
    alignItems: "center",
    backgroundColor: "rgba(28, 30, 47, 0.8)",
    borderColor: "rgba(111, 107, 132, 0.32)",
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: "48.5%",
    flexDirection: "row",
    gap: 9,
    minHeight: 58,
    paddingHorizontal: 10
  },
  chatSuggestionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
    width: "100%"
  },
  chatSuggestionIcon: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  chatSuggestionText: {
    color: colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17
  },
  chatMessageList: {
    flex: 1,
    minHeight: 0
  },
  chatMessageListContent: {
    gap: 10,
    justifyContent: "flex-end",
    minHeight: "100%",
    paddingBottom: 2
  },
  chatWelcomeBlock: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 0
  },
  chatWelcomeSubtitle: {
    color: "#AAA6BC",
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 21,
    marginTop: 7,
    maxWidth: 310,
    textAlign: "center"
  },
  chatWelcomeTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 27,
    marginTop: 16,
    textAlign: "center"
  },
  chatWindow: {
    backgroundColor: "#101219",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minWidth: 0,
    overflow: "hidden"
  },
  compactRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 52
  },
  communityFeed: {
    flex: 1,
    gap: 10
  },
  communityMiniCard: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 7,
    minHeight: 112,
    minWidth: 150,
    padding: 14
  },
  communityPreviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  communityAnalytics: {
    flex: 1,
    padding: 11
  },
  communityAvatar: {
    alignItems: "center",
    borderRadius: 9,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  communityAvatarText: {
    fontSize: 18,
    fontWeight: "900"
  },
  communityBarChart: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 5,
    height: 40,
    marginTop: 10
  },
  communityBookmark: {
    alignItems: "center",
    backgroundColor: "rgba(19, 22, 35, 0.62)",
    borderColor: "rgba(118, 114, 138, 0.34)",
    borderRadius: 8,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  communityCalendar: {
    alignContent: "center",
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    padding: 13
  },
  communityCalendarDot: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 999,
    height: 8,
    width: 8
  },
  communityChartBar: {
    borderRadius: 2,
    width: 7
  },
  communityFilterButton: {
    alignItems: "center",
    backgroundColor: "rgba(15, 17, 29, 0.8)",
    borderColor: "rgba(118, 101, 171, 0.3)",
    borderRadius: 11,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  communityBackdrop: {
    ...StyleSheet.absoluteFillObject
  },
  communityBackdropImage: {
    borderRadius: 24,
    opacity: 0.44
  },
  communityBackdropShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5, 7, 17, 0.74)",
    borderRadius: 24
  },
  communityHabitCard: {
    alignItems: "center",
    backgroundColor: "rgba(14, 36, 31, 0.74)",
    borderRadius: 8,
    height: 96,
    justifyContent: "center",
    margin: 8,
    width: 78
  },
  communityHabitRing: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 6,
    height: 55,
    justifyContent: "center",
    width: 55
  },
  communityHabitScore: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  communityHabitText: {
    fontSize: 9,
    fontWeight: "900",
    marginTop: 6
  },
  communityHero: {
    alignItems: "flex-start",
    minHeight: 72,
    paddingTop: 4
  },
  communityHeroCopy: {
    maxWidth: "100%",
    minWidth: 0
  },
  communityHeroSubtitle: {
    color: "#B5B0CA",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 6
  },
  communityHeroTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 32
  },
  communityLineChart: {
    flex: 1,
    marginTop: 14,
    overflow: "hidden",
    position: "relative"
  },
  communityLinePoint: {
    backgroundColor: "#5D32FF",
    borderRadius: 999,
    height: 5,
    position: "absolute",
    width: 5
  },
  communityMetricCard: {
    backgroundColor: "rgba(255, 255, 255, 0.055)",
    borderRadius: 6,
    flex: 1,
    padding: 6
  },
  communityMetricDelta: {
    color: "#51E895",
    fontSize: 8,
    fontWeight: "900",
    marginTop: 2
  },
  communityMetricRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 11
  },
  communityMetricValue: {
    color: colors.text,
    fontSize: 10,
    fontWeight: "900"
  },
  communityPostBadge: {
    borderRadius: 999,
    fontSize: 10,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  communityPostBadgeBlue: {
    backgroundColor: "rgba(37, 88, 178, 0.32)",
    color: "#5792FF"
  },
  communityPostBadgeGreen: {
    backgroundColor: "rgba(45, 177, 106, 0.2)",
    color: "#51E895"
  },
  communityPostBadgePurple: {
    backgroundColor: "rgba(83, 31, 150, 0.52)",
    color: "#C975FF"
  },
  communityPostBody: {
    flex: 1,
    gap: 8,
    minWidth: 0
  },
  communityPostCard: {
    backgroundColor: "rgba(8, 13, 24, 0.86)",
    borderColor: "rgba(128, 106, 180, 0.26)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 132,
    padding: 12
  },
  communityPostDescription: {
    color: "#B2AFC1",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: 4
  },
  communityPostLeft: {
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minWidth: 0
  },
  communityPostStat: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  communityPostStats: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14
  },
  communityPostStatText: {
    color: "#B7B4C8",
    fontSize: 12,
    fontWeight: "900"
  },
  communityPostTag: {
    borderRadius: 999,
    fontSize: 10,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  communityPostTagBlue: {
    backgroundColor: "rgba(37, 88, 178, 0.32)",
    color: "#5792FF"
  },
  communityPostTagGreen: {
    backgroundColor: "rgba(45, 177, 106, 0.18)",
    color: "#51E895"
  },
  communityPostTagPurple: {
    backgroundColor: "rgba(83, 31, 150, 0.52)",
    color: "#B96DFF"
  },
  communityPostTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  communityPostTime: {
    color: "#A9A5B8",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2
  },
  communityPostTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 20
  },
  communityPostUser: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 17
  },
  communityPostSide: {
    alignItems: "flex-end",
    gap: 10,
    justifyContent: "space-between"
  },
  communityPreview: {
    backgroundColor: "rgba(10, 14, 25, 0.96)",
    borderRadius: 7,
    borderWidth: 1,
    flexDirection: "row",
    height: 84,
    overflow: "hidden",
    width: 122
  },
  communityPreviewContent: {
    flex: 1,
    padding: 8
  },
  communityPreviewRow: {
    backgroundColor: "rgba(255, 255, 255, 0.11)",
    borderRadius: 999,
    height: 5,
    marginTop: 5,
    width: "86%"
  },
  communityPreviewRows: {
    marginTop: 6
  },
  communityPreviewRowShort: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 999,
    height: 5,
    marginTop: 5,
    width: "62%"
  },
  communityPreviewSidebar: {
    backgroundColor: "rgba(15, 14, 28, 0.92)",
    gap: 6,
    paddingHorizontal: 7,
    paddingTop: 9,
    width: 32
  },
  communityPreviewSideDot: {
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 999,
    height: 5,
    width: 5
  },
  communityPreviewTiny: {
    color: "#DAD6EA",
    fontSize: 7,
    fontWeight: "900"
  },
  communityPreviewValue: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 4
  },
  communityScreen: {
    flex: 1,
    gap: 12,
    paddingBottom: 8,
    position: "relative"
  },
  communitySearchBar: {
    alignItems: "center",
    backgroundColor: "rgba(10, 13, 24, 0.8)",
    borderColor: "rgba(118, 101, 171, 0.28)",
    borderRadius: 11,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 14
  },
  communitySearchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    minHeight: 42
  },
  communitySearchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  communityTab: {
    alignItems: "center",
    backgroundColor: "rgba(18, 19, 30, 0.82)",
    borderColor: "rgba(112, 105, 133, 0.32)",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 16
  },
  communityTabActive: {
    backgroundColor: "rgba(96, 42, 168, 0.74)",
    borderColor: "rgba(188, 104, 255, 0.78)",
    shadowColor: "#A64BFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.74,
    shadowRadius: 12
  },
  communityTabs: {
    flexDirection: "row",
    gap: 8
  },
  communityTabText: {
    color: "#B5B0C3",
    fontSize: 13,
    fontWeight: "900"
  },
  communityTabTextActive: {
    color: colors.text
  },
  content: {
    flexGrow: 1,
    paddingBottom: 126,
    paddingHorizontal: 18,
    paddingTop: 8
  },
  dashboardContent: {
    justifyContent: "space-between",
    paddingBottom: 94,
    paddingTop: 4
  },
  projectsContent: {
    paddingHorizontal: 8,
    paddingTop: 10
  },
  dangerButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 93, 122, 0.11)",
    borderColor: "rgba(255, 93, 122, 0.26)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 13
  },
  dangerButtonText: {
    color: "#FFB4C1",
    fontSize: 13,
    fontWeight: "900"
  },
  emptyText: {
    color: colors.dim,
    fontSize: 14,
    fontWeight: "700"
  },
  filterChip: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  filterChipActive: {
    backgroundColor: "rgba(167, 243, 208, 0.12)",
    borderColor: "rgba(167, 243, 208, 0.28)"
  },
  filterChipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900"
  },
  filterChipTextActive: {
    color: "#DDFCEB"
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  fixedComposer: {
    alignItems: "flex-end",
    backgroundColor: "#0C0E14",
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 12
  },
  bottomNav: {
    alignItems: "center",
    backgroundColor: "rgba(12, 15, 28, 0.96)",
    borderColor: "rgba(119, 81, 178, 0.28)",
    borderRadius: 30,
    borderWidth: 1,
    bottom: Platform.OS === "ios" ? 18 : 14,
    flexDirection: "row",
    gap: 6,
    justifyContent: "space-between",
    left: 18,
    minHeight: 64,
    padding: 6,
    position: "absolute",
    right: 18,
    shadowColor: "#4A2E83",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.28,
    shadowRadius: 24
  },
  bottomNavItem: {
    alignItems: "center",
    borderRadius: 20,
    flex: 1,
    gap: 3,
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: 2
  },
  bottomNavItemActive: {
    backgroundColor: "rgba(99, 42, 210, 0.42)",
    borderColor: "rgba(171, 89, 255, 0.38)",
    borderWidth: 1
  },
  bottomNavText: {
    color: "#A8A7BA",
    fontSize: 10,
    fontWeight: "900"
  },
  bottomNavTextActive: {
    color: "#A95BFF"
  },
  iconOnlyButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  infoLabel: {
    color: colors.dim,
    fontSize: 13,
    fontWeight: "800"
  },
  infoRow: {
    alignItems: "center",
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 52
  },
  infoValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  keyboard: {
    flex: 1
  },
  main: {
    backgroundColor: "#02030C",
    flex: 1,
    minWidth: 0
  },
  messageBubble: {
    borderRadius: 8,
    maxWidth: "82%",
    padding: 12
  },
  messageBubbleAssistant: {
    alignSelf: "flex-start",
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: 1
  },
  messageBubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: colors.magenta
  },
  messageStack: {
    gap: 10,
    minHeight: 500,
    padding: 16
  },
  messageText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22
  },
  pageHeader: {
    alignItems: "flex-start",
    flexDirection: "column",
    gap: 16,
    justifyContent: "space-between"
  },
  pageHeaderCopy: {
    flex: 1,
    minWidth: 0
  },
  pageStack: {
    flex: 1,
    gap: 16,
    minHeight: "100%"
  },
  pageTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 36
  },
  postCard: {
    alignItems: "flex-start",
    backgroundColor: "#101219",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14
  },
  postContent: {
    flex: 1,
    minWidth: 0
  },
  postTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22,
    marginTop: 4
  },
  postTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  postUser: {
    color: "#DDFCEB",
    fontSize: 14,
    fontWeight: "900"
  },
  previousChat: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 148,
    padding: 10
  },
  previousChatsRail: {
    gap: 8,
    paddingRight: 4
  },
  previousChatActive: {
    borderColor: "rgba(167, 243, 208, 0.3)"
  },
  previousChatMeta: {
    color: colors.dim,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4
  },
  previousChatTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  primaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 14
  },
  primaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  heroActionsRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 22,
    width: "100%"
  },
  heroPrimaryButton: {
    alignItems: "center",
    backgroundColor: "#7433FF",
    borderRadius: 9,
    flexDirection: "row",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 14,
    shadowColor: "#7433FF",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 22
  },
  heroPrimaryButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  profileAvatar: {
    alignItems: "center",
    backgroundColor: "rgba(167, 243, 208, 0.12)",
    borderRadius: 8,
    height: 62,
    justifyContent: "center",
    width: 62
  },
  profileAvatarText: {
    color: "#DDFCEB",
    fontSize: 24,
    fontWeight: "900"
  },
  profileHero: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    marginBottom: 8
  },
  profileMeta: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 3
  },
  profileName: {
    color: colors.text,
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: 0
  },
  profileAvatarLarge: {
    alignItems: "center",
    backgroundColor: "rgba(38, 24, 78, 0.96)",
    borderColor: "rgba(151, 67, 255, 0.72)",
    borderRadius: 999,
    borderWidth: 1,
    height: 91,
    justifyContent: "center",
    shadowColor: "#8F35FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.78,
    shadowRadius: 18,
    width: 91
  },
  profileAvatarLargeText: {
    color: colors.text,
    fontSize: 35,
    fontWeight: "900"
  },
  profileConnectionDot: {
    backgroundColor: "#55D77D",
    borderRadius: 999,
    height: 9,
    width: 9
  },
  profileConnectionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 11
  },
  profileConnectionText: {
    color: "#6FEA8E",
    fontSize: 15,
    fontWeight: "900"
  },
  profileEditButton: {
    alignItems: "center",
    backgroundColor: "rgba(35, 35, 49, 0.86)",
    borderColor: "rgba(113, 108, 132, 0.32)",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 39,
    paddingHorizontal: 16
  },
  profileEditText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  profileGroup: {
    backgroundColor: "rgba(15, 18, 28, 0.88)",
    borderColor: "rgba(106, 101, 122, 0.28)",
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 18
  },
  profileGroupDangerTitle: {
    color: "#FF5D5D"
  },
  profileGroupTitle: {
    color: "#A95BFF",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 6
  },
  profileHeader: {
    paddingHorizontal: 12,
    paddingTop: 24
  },
  profilePageSubtitle: {
    color: "#B7B3C4",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
    marginTop: 9
  },
  profilePageTitle: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 40
  },
  profileRow: {
    alignItems: "center",
    borderBottomColor: "rgba(125, 120, 142, 0.18)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 14,
    minHeight: 65
  },
  profileRowBadge: {
    backgroundColor: "rgba(45, 177, 106, 0.2)",
    borderRadius: 999,
    color: "#6FEA8E",
    fontSize: 13,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  profileRowCopy: {
    flex: 1,
    minWidth: 0
  },
  profileRowIcon: {
    alignItems: "center",
    backgroundColor: "rgba(43, 43, 59, 0.82)",
    borderRadius: 12,
    height: 43,
    justifyContent: "center",
    width: 43
  },
  profileRowIconDanger: {
    backgroundColor: "rgba(255, 93, 93, 0.13)"
  },
  profileRowLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19
  },
  profileRowLast: {
    borderBottomWidth: 0
  },
  profileRowValue: {
    color: "#B6B1C4",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 3
  },
  profileScreen: {
    gap: 13
  },
  profileStat: {
    alignItems: "center",
    borderRightColor: "rgba(125, 120, 142, 0.22)",
    borderRightWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 75
  },
  profileStatIcon: {
    alignItems: "center",
    backgroundColor: "rgba(75, 34, 132, 0.28)",
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  profileStatLabel: {
    color: "#B7B3C4",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    marginTop: 3
  },
  profileStatLast: {
    borderRightWidth: 0
  },
  profileStatsPanel: {
    backgroundColor: "rgba(21, 22, 34, 0.72)",
    borderColor: "rgba(113, 108, 132, 0.28)",
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 20,
    overflow: "hidden"
  },
  profileStatValue: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 25
  },
  profileSummaryCard: {
    backgroundColor: "rgba(14, 17, 28, 0.9)",
    borderColor: "rgba(139, 60, 255, 0.48)",
    borderRadius: 13,
    borderWidth: 1,
    padding: 20
  },
  profileSummaryCopy: {
    flex: 1,
    minWidth: 0
  },
  profileSummaryEmail: {
    color: "#B7B3C4",
    fontSize: 17,
    fontWeight: "800",
    marginTop: 7
  },
  profileSummaryName: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 31
  },
  profileSummaryTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 21
  },
  profileTab: {
    alignItems: "center",
    backgroundColor: "rgba(18, 19, 30, 0.82)",
    borderColor: "rgba(112, 105, 133, 0.34)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 45,
    paddingHorizontal: 9
  },
  profileTabActive: {
    backgroundColor: "rgba(38, 84, 65, 0.36)",
    borderColor: "rgba(102, 224, 158, 0.54)"
  },
  profileTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    paddingHorizontal: 12
  },
  profileTabText: {
    color: "#BAB5CA",
    fontSize: 12,
    fontWeight: "900"
  },
  profileTabTextActive: {
    color: "#DDFCEB"
  },
  projectsBackdrop: {
    ...StyleSheet.absoluteFillObject
  },
  projectsBackdropImage: {
    opacity: 0.44
  },
  projectsBackdropShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5, 7, 17, 0.72)"
  },
  projectsCreateButton: {
    alignSelf: "flex-start",
    borderRadius: 9,
    marginTop: 14,
    overflow: "hidden",
    shadowColor: "#7130FF",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.26,
    shadowRadius: 16
  },
  projectsCreateGradient: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 14
  },
  projectsCreateText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  projectsFilterButton: {
    alignItems: "center",
    backgroundColor: "rgba(15, 17, 29, 0.8)",
    borderColor: "rgba(118, 101, 171, 0.3)",
    borderRadius: 11,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  projectsFilterButtonActive: {
    backgroundColor: "rgba(96, 42, 168, 0.58)",
    borderColor: "rgba(188, 104, 255, 0.64)"
  },
  projectsFilterLabel: {
    color: "#A9A5B8",
    fontSize: 12,
    fontWeight: "900",
    marginTop: -4,
    paddingHorizontal: 2,
    textTransform: "capitalize"
  },
  projectsHero: {
    alignItems: "center",
    flexDirection: "row",
    gap: 18,
    justifyContent: "space-between",
    minHeight: 182,
    paddingTop: 8
  },
  projectsHeroCopy: {
    flex: 1,
    maxWidth: 320,
    minWidth: 0
  },
  projectsFoldersHero: {
    aspectRatio: 1448 / 1086,
    flexShrink: 0,
    height: 170,
    marginRight: -2,
    maxWidth: 228,
    minWidth: 148
  },
  projectsFoldersHeroComfort: {
    height: 158,
    maxWidth: 212,
    minWidth: 138
  },
  projectsFoldersHeroCompact: {
    height: 132,
    maxWidth: 176,
    minWidth: 112
  },
  projectsFoldersHeroNarrow: {
    height: 146,
    maxWidth: 195,
    minWidth: 124
  },
  projectsHeroSubtitle: {
    color: "#B5B0CA",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 6
  },
  projectsHeroTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 32
  },
  projectsList: {
    gap: 12,
    width: "100%"
  },
  projectsEmptyState: {
    alignItems: "center",
    backgroundColor: "rgba(7, 10, 20, 0.64)",
    borderColor: "rgba(128, 106, 180, 0.22)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    justifyContent: "center",
    minHeight: 104
  },
  projectsEmptyText: {
    color: "#A9A5B8",
    fontSize: 13,
    fontWeight: "900"
  },
  projectsScreen: {
    gap: 14,
    paddingBottom: 18,
    paddingHorizontal: 10,
    position: "relative"
  },
  projectsSearchBar: {
    alignItems: "center",
    backgroundColor: "rgba(10, 13, 24, 0.8)",
    borderColor: "rgba(118, 101, 171, 0.28)",
    borderRadius: 11,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 14
  },
  projectsSearchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    minHeight: 42
  },
  projectsSearchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  projectCard: {
    alignSelf: "stretch",
    backgroundColor: "rgba(7, 10, 20, 0.86)",
    borderColor: "rgba(128, 106, 180, 0.26)",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    width: "100%"
  },
  projectCardActive: {
    borderColor: "rgba(79, 221, 154, 0.54)"
  },
  projectCardCopy: {
    flex: 1,
    minWidth: 0
  },
  projectCardFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  projectCardFooterComfort: {
    flexWrap: "wrap"
  },
  projectCardFooterStacked: {
    alignItems: "stretch",
    flexDirection: "column",
    gap: 10
  },
  projectCardMain: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12
  },
  projectCardRight: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 12,
    paddingTop: 1
  },
  projectCardTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  projectDivider: {
    backgroundColor: "rgba(132, 128, 151, 0.16)",
    height: 1,
    marginBottom: 10,
    marginTop: 12,
    width: "100%"
  },
  projectFooterActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginLeft: "auto"
  },
  projectFooterActionsComfort: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    marginLeft: "auto"
  },
  projectFooterActionsStacked: {
    alignItems: "center",
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 7,
    justifyContent: "flex-end"
  },
  projectFooterDetails: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minWidth: 0
  },
  projectFooterDetailsStacked: {
    alignItems: "center",
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9
  },
  projectFooterMeta: {
    alignItems: "center",
    flexShrink: 1,
    flexDirection: "row",
    gap: 5,
    minWidth: 0
  },
  projectFooterText: {
    color: "#AAA6BC",
    fontSize: 12,
    fontWeight: "800"
  },
  projectGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  projectIcon: {
    alignItems: "center",
    backgroundColor: "rgba(30, 29, 45, 0.74)",
    borderRadius: 13,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  projectIconActive: {
    backgroundColor: "rgba(43, 96, 79, 0.38)"
  },
  projectIconButton: {
    alignItems: "center",
    backgroundColor: "rgba(20, 22, 35, 0.78)",
    borderColor: "rgba(104, 100, 124, 0.28)",
    borderRadius: 9,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  projectIconCompleted: {
    backgroundColor: "rgba(83, 31, 150, 0.58)"
  },
  projectMoreButton: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    width: 24
  },
  projectMeta: {
    color: "#8F8B9F",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 4
  },
  projectName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 20
  },
  projectOpenButton: {
    borderRadius: 9,
    overflow: "hidden"
  },
  projectOpenGradient: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    height: 34,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  projectOpenText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  projectQuickAction: {
    alignItems: "center",
    backgroundColor: "rgba(96, 42, 168, 0.28)",
    borderColor: "rgba(188, 104, 255, 0.28)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 30,
    paddingHorizontal: 10
  },
  projectQuickActionText: {
    color: "#DAD6F6",
    fontSize: 12,
    fontWeight: "900"
  },
  projectQuickPanel: {
    alignItems: "center",
    backgroundColor: "rgba(15, 17, 29, 0.76)",
    borderColor: "rgba(118, 101, 171, 0.22)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  projectQuickText: {
    color: "#A9A5B8",
    flex: 1,
    fontSize: 12,
    fontWeight: "800"
  },
  projectStackDot: {
    backgroundColor: "#5C2FE8",
    borderRadius: 999,
    height: 7,
    width: 7
  },
  projectStackRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 8
  },
  projectStack: {
    color: "#B9B5C8",
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 15
  },
  projectStatusActive: {
    backgroundColor: "rgba(45, 177, 106, 0.22)",
    color: "#5AF19D"
  },
  projectStatusCompleted: {
    backgroundColor: "rgba(83, 31, 150, 0.52)",
    color: "#D075FF"
  },
  projectStatusArchived: {
    backgroundColor: "rgba(105, 102, 123, 0.22)",
    color: "#C4BECE"
  },
  projectStatusDraft: {
    backgroundColor: "rgba(42, 43, 58, 0.68)",
    color: "#C9C3D6"
  },
  projectStatusPill: {
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  projectTitleDot: {
    borderRadius: 999,
    height: 8,
    marginLeft: 8,
    width: 8
  },
  projectTitleRow: {
    alignItems: "center",
    flexDirection: "row"
  },
  rowCopy: {
    flex: 1,
    minWidth: 0
  },
  rowIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 8,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  rowIconGreen: {
    backgroundColor: "rgba(167, 243, 208, 0.1)"
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  searchBar: {
    alignItems: "center",
    backgroundColor: "#101219",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 13
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    minHeight: 46
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 36,
    paddingHorizontal: 12
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  settingsPanel: {
    backgroundColor: "#101219",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 16
  },
  settingsTab: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  settingsTabActive: {
    backgroundColor: "rgba(167, 243, 208, 0.12)",
    borderColor: "rgba(167, 243, 208, 0.28)"
  },
  settingsTabText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900"
  },
  settingsTabTextActive: {
    color: "#DDFCEB"
  },
  settingsTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  shell: {
    backgroundColor: "#02030C",
    flex: 1,
    flexDirection: "column",
    overflow: "hidden"
  },
  statusActive: {
    backgroundColor: "rgba(167, 243, 208, 0.12)",
    color: "#DDFCEB"
  },
  statusDot: {
    backgroundColor: colors.success,
    borderRadius: 999,
    height: 7,
    width: 7
  },
  statusLabel: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 999,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  statusPill: {
    alignItems: "center",
    backgroundColor: "rgba(55, 214, 122, 0.1)",
    borderColor: "rgba(55, 214, 122, 0.18)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  statusText: {
    color: "#B9F8D0",
    fontSize: 12,
    fontWeight: "900"
  },
  taskDot: {
    backgroundColor: "#48D88A",
    borderRadius: 999,
    height: 7,
    width: 7
  },
  taskPill: {
    alignItems: "center",
    backgroundColor: "rgba(14, 45, 41, 0.62)",
    borderColor: "rgba(62, 226, 145, 0.22)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 28,
    paddingHorizontal: 14
  },
  taskPillText: {
    color: "#9BE8BC",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0
  },
  pcApprovalCard: {
    alignItems: "center",
    backgroundColor: "rgba(36, 76, 58, 0.24)",
    borderColor: "rgba(112, 240, 162, 0.28)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12
  },
  pcApprovalCopy: {
    flex: 1,
    minWidth: 0
  },
  pcApprovalIcon: {
    alignItems: "center",
    backgroundColor: "rgba(112, 240, 162, 0.12)",
    borderRadius: 12,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  pcApprovalText: {
    color: "#B7DEC5",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: 3
  },
  pcApprovalTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18
  },
  pcCandidateCopy: {
    flex: 1,
    minWidth: 0
  },
  pcCandidateIcon: {
    alignItems: "center",
    backgroundColor: "rgba(96, 57, 170, 0.24)",
    borderColor: "rgba(154, 91, 255, 0.3)",
    borderRadius: 12,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  pcCandidateIconCurrent: {
    backgroundColor: "rgba(54, 181, 111, 0.18)",
    borderColor: "rgba(112, 240, 162, 0.34)"
  },
  pcCandidateList: {
    gap: 9
  },
  pcCandidateMeta: {
    color: "#9E98B1",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3
  },
  pcCandidateStatusChecking: {
    backgroundColor: "#FFE76A"
  },
  pcCandidateStatusCurrent: {
    backgroundColor: "#70F0A2"
  },
  pcCandidateStatusDot: {
    borderRadius: 999,
    height: 7,
    width: 7
  },
  pcCandidateStatusOffline: {
    backgroundColor: "#6F6A80"
  },
  pcCandidateStatusOnline: {
    backgroundColor: "#51E895"
  },
  pcCandidateStatusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7
  },
  pcCandidateRow: {
    alignItems: "center",
    backgroundColor: "rgba(16, 18, 31, 0.82)",
    borderColor: "rgba(112, 105, 133, 0.26)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 12
  },
  pcCandidateTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  pcCodeButton: {
    alignItems: "center",
    backgroundColor: "#6E31FF",
    borderRadius: 11,
    height: 44,
    justifyContent: "center",
    width: 48
  },
  pcCodeInput: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
    minHeight: 44,
    paddingHorizontal: 13
  },
  pcCodeRow: {
    alignItems: "center",
    backgroundColor: "rgba(9, 11, 21, 0.78)",
    borderColor: "rgba(118, 101, 171, 0.28)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 5
  },
  pcConfirmButton: {
    alignItems: "center",
    backgroundColor: "rgba(112, 240, 162, 0.18)",
    borderColor: "rgba(112, 240, 162, 0.42)",
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 36,
    paddingHorizontal: 12,
    justifyContent: "center"
  },
  pcConfirmButtonText: {
    color: "#DDFCEB",
    fontSize: 12,
    fontWeight: "900"
  },
  pcManualPanel: {
    gap: 9
  },
  pcManualTitle: {
    color: "#C8C1DC",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  pcScanButton: {
    alignItems: "center",
    backgroundColor: "rgba(108, 49, 255, 0.88)",
    borderColor: "rgba(190, 150, 255, 0.42)",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 48,
    shadowColor: "#7334FF",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 18
  },
  pcScanButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  pcSwitcherClose: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 10,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  pcSwitcherError: {
    color: "#FF9DAE",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16
  },
  pcSwitcherHandle: {
    alignSelf: "center",
    backgroundColor: "rgba(207, 199, 226, 0.26)",
    borderRadius: 999,
    height: 4,
    width: 42
  },
  pcSwitcherHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 13
  },
  pcSwitcherHeaderCopy: {
    flex: 1,
    minWidth: 0
  },
  pcSwitcherHeaderIcon: {
    alignItems: "center",
    backgroundColor: "rgba(92, 47, 232, 0.34)",
    borderColor: "rgba(183, 124, 255, 0.34)",
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  pcSwitcherKicker: {
    color: "#9AE9B4",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  pcSwitcherMessage: {
    color: "#B8B2C9",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16
  },
  pcSwitcherOverlay: {
    flex: 1,
    justifyContent: "flex-end"
  },
  pcSwitcherScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.58)"
  },
  pcSwitcherSheet: {
    backgroundColor: "rgba(6, 8, 18, 0.98)",
    borderColor: "rgba(126, 102, 190, 0.32)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    gap: 15,
    paddingBottom: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    shadowColor: "#6E31FF",
    shadowOffset: { width: 0, height: -14 },
    shadowOpacity: 0.22,
    shadowRadius: 28
  },
  pcSwitcherTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 24
  },
  tokenPill: {
    alignItems: "center",
    backgroundColor: "rgba(255, 232, 111, 0.08)",
    borderColor: "rgba(255, 232, 111, 0.2)",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  tokenPillPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.98 }]
  },
  tokenCycleStats: {
    flexDirection: "row",
    gap: 8
  },
  tokenHeroLabel: {
    color: "#D7D1E5",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  tokenHeroPanel: {
    backgroundColor: "rgba(16, 18, 31, 0.82)",
    borderColor: "rgba(255, 231, 106, 0.2)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    overflow: "hidden",
    padding: 13
  },
  tokenHeroTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  tokenHeroValue: {
    color: colors.text,
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 30,
    marginTop: 3
  },
  tokenManageButton: {
    borderRadius: 13,
    overflow: "hidden",
    shadowColor: "#7334FF",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 18
  },
  tokenManageButtonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }]
  },
  tokenManageGradient: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    minHeight: 48
  },
  tokenManageText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  tokenMiniStat: {
    backgroundColor: "rgba(9, 11, 21, 0.78)",
    borderColor: "rgba(118, 101, 171, 0.2)",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minHeight: 54,
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  tokenMiniStatLabel: {
    color: "#A9A2B8",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  tokenMiniStatValue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 21,
    marginTop: 4
  },
  tokenRenewalBadge: {
    alignItems: "center",
    backgroundColor: "rgba(255, 231, 106, 0.1)",
    borderColor: "rgba(255, 231, 106, 0.24)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6
  },
  tokenRenewalText: {
    color: "#FFF2A4",
    fontSize: 11,
    fontWeight: "900"
  },
  tokenSectionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 18
  },
  tokenSheet: {
    backgroundColor: "rgba(6, 8, 18, 0.98)",
    borderColor: "rgba(126, 102, 190, 0.32)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    gap: 15,
    paddingBottom: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    shadowColor: "#6E31FF",
    shadowOffset: { width: 0, height: -14 },
    shadowOpacity: 0.22,
    shadowRadius: 28
  },
  tokenSheetClose: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 10,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  tokenSheetContent: {
    gap: 13,
    paddingBottom: 2
  },
  tokenSheetHandle: {
    alignSelf: "center",
    backgroundColor: "rgba(207, 199, 226, 0.26)",
    borderRadius: 999,
    height: 4,
    width: 42
  },
  tokenSheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 13
  },
  tokenSheetHeaderCopy: {
    flex: 1,
    minWidth: 0
  },
  tokenSheetHeaderIcon: {
    alignItems: "center",
    backgroundColor: "rgba(92, 47, 232, 0.34)",
    borderColor: "rgba(183, 124, 255, 0.34)",
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  tokenSheetKicker: {
    color: "#FFE76A",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  tokenSheetOverlay: {
    flex: 1,
    justifyContent: "flex-end"
  },
  tokenSheetScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.58)"
  },
  tokenSheetScroll: {
    flexShrink: 1
  },
  tokenSheetTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 24
  },
  tokenText: {
    color: "#FFE76A",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 18
  },
  tokenSubtext: {
    color: "#BDB9C7",
    fontSize: 10,
    fontWeight: "900"
  },
  tokenTrack: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 999,
    height: 10,
    overflow: "hidden"
  },
  tokenTrackFill: {
    borderRadius: 999,
    height: 10
  },
  tokenUsageCopy: {
    flex: 1,
    minWidth: 0
  },
  tokenUsageIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255, 231, 106, 0.08)",
    borderColor: "rgba(255, 231, 106, 0.18)",
    borderRadius: 12,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  tokenUsageLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  tokenUsagePanel: {
    backgroundColor: "rgba(16, 18, 31, 0.82)",
    borderColor: "rgba(112, 105, 133, 0.26)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  tokenUsageRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11,
    minHeight: 42
  },
  tokenUsageValue: {
    color: "#AFA9C0",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2
  },
  topBar: {
    alignItems: "center",
    backgroundColor: "#02030C",
    borderBottomColor: "rgba(91, 91, 112, 0.18)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    minHeight: 74,
    paddingBottom: 10,
    paddingHorizontal: 16,
    paddingTop: 10
  },
  topLeft: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 11,
    minWidth: 0
  },
  topLeftPressed: {
    opacity: 0.74
  },
  topMachineCopy: {
    flex: 1,
    minWidth: 0
  },
  topConnectionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  topKicker: {
    color: "#9AE9B4",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  topRight: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end"
  },
  topTitle: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 22
  },
  topTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    minWidth: 0
  },
  twoColumn: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16
  },
  welcomeCopy: {
    alignItems: "flex-start",
    marginTop: 26,
    minWidth: 0,
    width: "100%"
  },
  welcomeBodyText: {
    textAlign: "left"
  },
  welcomePanel: {
    backgroundColor: "#0B0B18",
    borderColor: "rgba(153, 84, 255, 0.42)",
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 204,
    overflow: "hidden",
    shadowColor: "#7C3DFF",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18,
    shadowRadius: 34
  },
  welcomeBackdrop: {
    minHeight: 204,
    overflow: "hidden",
    paddingBottom: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    width: "100%"
  },
  welcomeBackdropFill: {
    opacity: 0.62,
    transform: [{ scale: 1.04 }]
  },
  welcomeBackdropLayer: {
    ...StyleSheet.absoluteFillObject,
    height: "100%",
    opacity: 0.98,
    width: "100%"
  },
  welcomeBackdropShade: {
    ...StyleSheet.absoluteFillObject
  },
  welcomeTitle: {
    color: colors.text,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 41,
    textAlign: "left"
  },
  mobileConnectionCard: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(55, 214, 122, 0.1)",
    borderColor: "rgba(55, 214, 122, 0.18)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  mobileConnectionCopy: {
    minWidth: 0
  },
  dashboardPage: {
    flex: 1,
    gap: 6,
    width: "100%"
  },
  dashboardLogo: {
    height: 36,
    width: 52
  },
  dashboardStat: {
    borderRightColor: "rgba(101, 72, 139, 0.38)",
    borderRightWidth: 1,
    flex: 1,
    alignItems: "center",
    minHeight: 62,
    paddingHorizontal: 6,
    paddingVertical: 9
  },
  dashboardStatLast: {
    borderRightWidth: 0
  },
  dashboardStatLabel: {
    color: "#A9A7BB",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 13,
    marginTop: 4,
    textAlign: "center"
  },
  dashboardStats: {
    alignItems: "stretch",
    backgroundColor: "rgba(14, 18, 34, 0.86)",
    borderColor: "rgba(102, 73, 145, 0.32)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: -2,
    overflow: "hidden",
    shadowColor: "#2D1B4D",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 20
  },
  dashboardStatTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    justifyContent: "center"
  },
  dashboardStatValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0
  },
  homeActions: {
    gap: 10
  },
  homeAction: {
    alignItems: "center",
    backgroundColor: "rgba(13, 17, 31, 0.9)",
    borderColor: "rgba(113, 91, 149, 0.28)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 66,
    paddingHorizontal: 18,
    shadowColor: "#101625",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18
  },
  homeActionBadge: {
    backgroundColor: "rgba(83, 39, 156, 0.54)",
    borderColor: "rgba(157, 91, 255, 0.36)",
    borderRadius: 8,
    borderWidth: 1,
    color: "#B96DFF",
    fontSize: 10,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  homeActionCopy: {
    flex: 1,
    minWidth: 0
  },
  homeActionIcon: {
    alignItems: "center",
    backgroundColor: "rgba(75, 32, 145, 0.62)",
    borderColor: "rgba(128, 72, 235, 0.32)",
    borderRadius: 12,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  homeActionLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 19
  },
  homeActionMeta: {
    color: "#A9A7BB",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 15,
    marginTop: 2
  }
});
