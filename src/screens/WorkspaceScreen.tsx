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
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";
import { VibyraLogo } from "../components/VibyraLogo";
import { useAppContext } from "../context/AppContext";
import { colors } from "../styles/theme";
import { Agent, ChatMessage, ModelKey, Project, RememberedDesktop } from "../types/domain";

const dashboardHeroArt = require("../assets/BG-transparent-vibyra.png");
const chatBuildAiHero = require("../assets/chat-build-ai-hero.png");
const projectsBackdrop = require("../assets/result-background.png");
const projectsFoldersHero = require("../assets/projects-folders-hero-glow-transparent.png");
const communityHero = require("../assets/community-hero-glow-transparent.png");
type DashboardPage = "dashboard" | "projects" | "chat" | "community" | "profile" | "upgrade";
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

type BillingCycle = "monthly" | "annual";
type MembershipPlan = {
  accent: string;
  annual: number;
  badge: string;
  description: string;
  featured?: boolean;
  features: string[];
  monthly: number;
  name: string;
};

const membershipPlans: MembershipPlan[] = [
  {
    accent: "#8E5CFF",
    annual: 19,
    badge: "Best value",
    description: "A strong starting point for solo builders shipping small projects.",
    features: ["1,500 tokens monthly", "Core AI models", "3 active projects", "Community templates"],
    monthly: 24,
    name: "Starter"
  },
  {
    accent: "#45E99B",
    annual: 49,
    badge: "Most popular",
    description: "More room, faster models, and enough usage for serious weekly builds.",
    featured: true,
    features: ["6,000 tokens monthly", "Claude, OpenAI and Gemini models", "Unlimited projects", "Priority build queue", "Advanced file edits"],
    monthly: 59,
    name: "Builder"
  },
  {
    accent: "#FFB44F",
    annual: 129,
    badge: "Scale",
    description: "Built for heavy product work, client builds, and high-output teams.",
    features: ["20,000 tokens monthly", "Highest-capability models", "Team workspaces", "Priority support", "Early access features"],
    monthly: 159,
    name: "Pro"
  }
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

type ChatModelProvider = "auto" | "claude" | "openai" | "gemini";
type ChatModelOption = {
  key: string;
  label: string;
  provider: ChatModelProvider;
  modelKey?: ModelKey;
};

const chatModelGroups: Array<{ title: string; options: ChatModelOption[] }> = [
  {
    title: "",
    options: [{ key: "auto", label: "Auto", provider: "auto" }]
  },
  {
    title: "Claude Models",
    options: [
      { key: "claude-opus-4", label: "Claude Opus 4", provider: "claude" },
      { key: "claude-sonnet-4", label: "Claude Sonnet 4", provider: "claude" },
      { key: "claude-3-5-haiku", label: "Claude Haiku 3.5", provider: "claude" }
    ]
  },
  {
    title: "OpenAI models",
    options: [
      { key: "gpt-5.5", label: "GPT-5.5", provider: "openai", modelKey: "gpt-5.5" },
      { key: "gpt-5.4", label: "GPT-5.4", provider: "openai", modelKey: "gpt-5.4" },
      { key: "gpt-5.4-mini", label: "GPT-5.4 Mini", provider: "openai", modelKey: "gpt-5.4-mini" },
      { key: "gpt-5-codex", label: "GPT-5 Codex", provider: "openai", modelKey: "gpt-5-codex" }
    ]
  },
  {
    title: "Gemini Models",
    options: [
      { key: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "gemini" },
      { key: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" },
      { key: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "gemini" }
    ]
  }
];

const chatModelOptions = chatModelGroups.flatMap((group) => group.options);
const providerLogoSources = {
  gemini: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Google_Gemini_icon_2025.svg/250px-Google_Gemini_icon_2025.svg.png",
  openai: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/OpenAI_logo_2025_%28symbol%29.svg/250px-OpenAI_logo_2025_%28symbol%29.svg.png"
};

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
  const [projectChatTitles, setProjectChatTitles] = useState<Record<string, string>>({});
  const [tokenSheetVisible, setTokenSheetVisible] = useState(false);
  const [projectsCanScroll, setProjectsCanScroll] = useState(false);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("annual");

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

  const openProjectChat = useCallback((projectId: string, projectName: string) => {
    const chatId = `project-${projectId}`;
    setProjectChatTitles((current) => ({ ...current, [chatId]: projectName }));
    setSelectedChatId(chatId);
    setActivePage("chat");
  }, []);

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
              activePage === "chat" ? styles.chatActiveContent : null,
              activePage === "projects" ? styles.projectsContent : null,
              activePage === "upgrade" ? styles.upgradeContent : null,
              { minHeight: Math.max(height - (activePage === "dashboard" ? 190 : activePage === "chat" ? 84 : 72), 0) }
            ]}
            bounces={activePage === "projects" ? projectsCanScroll : true}
            scrollEnabled={activePage === "projects" ? projectsCanScroll : activePage !== "dashboard" && activePage !== "chat"}
            showsVerticalScrollIndicator={false}
          >
            {activePage === "dashboard" ? (
              <DashboardHome
                activeAgents={app.activeAgents}
                machineName={app.connection?.machineName ?? app.machineName}
                onNavigate={setActivePage}
                projectCount={app.projects.length}
                projects={app.projects}
                selectedModel={app.selectedModel}
                tokenBalance={tokenMembership.balance}
              />
            ) : null}

            {activePage === "projects" ? (
              <ProjectsPage
                filteredProjects={filteredProjects}
                onCreateProject={app.createProject}
                onOpenProjectChat={openProjectChat}
                onSearch={setProjectSearch}
                onSelectProject={app.selectProject}
                onScrollNeededChange={setProjectsCanScroll}
                projectSearch={projectSearch}
                selectedProjectId={app.selectedProject.id}
              />
            ) : null}

            {activePage === "chat" ? (
              <AIChatPage
                agentRequesting={app.agentRequesting}
                chatMessages={app.chatMessages}
                onBack={() => {
                  setSelectedChatId(null);
                  setActivePage("dashboard");
                }}
                onStart={app.startAgent}
                selectedChatId={selectedChatId}
                projectChatTitles={projectChatTitles}
                selectedFileName={app.selectedFile.name}
                selectedModel={app.selectedModel}
                setSelectedChatId={setSelectedChatId}
                setSelectedModel={app.setSelectedModel}
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

            {activePage === "upgrade" ? (
              <UpgradePage
                billingCycle={billingCycle}
                onBack={() => setActivePage("dashboard")}
                onChangeBillingCycle={setBillingCycle}
              />
            ) : null}
          </ScrollView>
        </View>
        {activePage === "chat" ? null : <BottomNav activePage={activePage} onChange={setActivePage} />}
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
            setActivePage("upgrade");
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
  const availablePercent = Math.round((tokenMembership.balance / tokenMembership.allowance) * 100);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.tokenSheetOverlay}>
        <Pressable accessibilityLabel="Close token membership" style={styles.tokenSheetScrim} onPress={onClose} />
        <View style={styles.tokenSheet}>
          <View style={styles.tokenSheetHeader}>
            <View style={styles.tokenSheetHeaderIcon}>
              <Ionicons name="flash" color="#FFE76A" size={24} />
            </View>
            <View style={styles.tokenSheetHeaderCopy}>
              <Text style={styles.tokenSheetKicker}>Tokens remaining</Text>
              <Text style={styles.tokenSheetTitle}>{tokenMembership.balance.toLocaleString()}</Text>
            </View>
            <Pressable style={styles.tokenSheetClose} onPress={onClose}>
              <Ionicons name="close" color="#BDB8CE" size={21} />
            </Pressable>
          </View>

          <View style={styles.tokenCompactPanel}>
            <Text style={styles.tokenCompactPercent}>{availablePercent}% left this cycle</Text>
            <Text style={styles.tokenCompactMeta}>{tokenMembership.plan} plan - {tokenMembership.renewal.toLowerCase()}</Text>
          </View>

          <Pressable style={({ pressed }) => [styles.tokenManageButton, pressed ? styles.tokenManageButtonPressed : null]} onPress={onManage}>
            <LinearGradient
              colors={["#7A35FF", "#A85DFF", "#FFB44F"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.tokenManageGradient}
            >
              <Ionicons name="arrow-up-circle-outline" color={colors.text} size={20} />
              <Text style={styles.tokenManageText}>Upgrade</Text>
            </LinearGradient>
          </Pressable>
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

function UpgradePage({ billingCycle, onBack, onChangeBillingCycle }: {
  billingCycle: BillingCycle;
  onBack: () => void;
  onChangeBillingCycle: (cycle: BillingCycle) => void;
}) {
  return (
    <View style={styles.upgradePage}>
      <View style={styles.upgradeHeader}>
        <Pressable style={styles.upgradeBackButton} onPress={onBack}>
          <Ionicons name="chevron-back" color={colors.text} size={22} />
        </Pressable>
        <View style={styles.upgradeHeaderCopy}>
          <Text style={styles.upgradeKicker}>Upgrade Vibyra</Text>
          <Text style={styles.upgradeTitle}>Build more with fewer limits.</Text>
          <Text style={styles.upgradeSubtitle}>Annual plans give you the best effective price and the most room to keep momentum.</Text>
        </View>
      </View>

      <View style={styles.upgradeCycleControl}>
        {(["annual", "monthly"] as BillingCycle[]).map((cycle) => {
          const active = billingCycle === cycle;
          return (
            <Pressable
              key={cycle}
              onPress={() => onChangeBillingCycle(cycle)}
              style={[styles.upgradeCycleOption, active ? styles.upgradeCycleOptionActive : null]}
            >
              <Text style={[styles.upgradeCycleText, active ? styles.upgradeCycleTextActive : null]}>
                {cycle === "annual" ? "Annual" : "Monthly"}
              </Text>
              {cycle === "annual" ? <Text style={styles.upgradeCycleSave}>Save up to 19%</Text> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.upgradePlans}>
        {membershipPlans.map((plan) => (
          <PlanCard key={plan.name} billingCycle={billingCycle} plan={plan} />
        ))}
      </View>
    </View>
  );
}

function PlanCard({ billingCycle, plan }: {
  billingCycle: BillingCycle;
  plan: MembershipPlan;
}) {
  const price = billingCycle === "annual" ? plan.annual : plan.monthly;
  const monthlySavings = plan.monthly - plan.annual;

  return (
    <View style={[styles.planCard, plan.featured ? styles.planCardFeatured : null, { borderColor: `${plan.accent}66` }]}>
      {plan.featured ? (
        <LinearGradient
          colors={["rgba(69, 233, 155, 0.16)", "rgba(142, 92, 255, 0.08)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.planFeaturedWash}
        />
      ) : null}
      <View style={styles.planTopRow}>
        <View>
          <Text style={styles.planName}>{plan.name}</Text>
          <Text style={[styles.planBadge, { color: plan.accent }]}>{plan.badge}</Text>
        </View>
        <View style={[styles.planIcon, { backgroundColor: `${plan.accent}20`, borderColor: `${plan.accent}44` }]}>
          <Ionicons name={plan.featured ? "rocket-outline" : "sparkles-outline"} color={plan.accent} size={22} />
        </View>
      </View>

      <View style={styles.planPriceRow}>
        <Text style={styles.planPrice}>£{price}</Text>
        <Text style={styles.planPriceMeta}>/mo</Text>
      </View>
      <Text style={styles.planDescription}>
        {billingCycle === "annual" ? `Billed annually. Save £${monthlySavings * 12} a year.` : plan.description}
      </Text>

      <View style={styles.planFeatures}>
        {plan.features.map((feature) => (
          <View key={feature} style={styles.planFeatureRow}>
            <Ionicons name="checkmark-circle" color={plan.accent} size={18} />
            <Text style={styles.planFeatureText}>{feature}</Text>
          </View>
        ))}
      </View>

      <Pressable style={({ pressed }) => [styles.planButton, plan.featured ? styles.planButtonFeatured : null, pressed ? styles.planButtonPressed : null]}>
        {plan.featured ? (
          <LinearGradient
            colors={["#44E99C", "#8E5CFF"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.planButtonGradient}
          >
            <Text style={styles.planButtonTextFeatured}>Choose Builder</Text>
          </LinearGradient>
        ) : (
          <Text style={styles.planButtonText}>Choose {plan.name}</Text>
        )}
      </Pressable>
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
  activeAgents: Agent[];
  machineName: string;
  onNavigate: (page: DashboardPage) => void;
  projectCount: number;
  projects: Project[];
  selectedModel: string;
  tokenBalance: number;
}) {
  const { height } = useWindowDimensions();
  const compact = height < 780;
  const displayProjectCount = Math.max(props.projectCount, 7);
  const runningProjects = props.activeAgents.slice(0, compact ? 1 : 2).map((agent, index) => {
    const project = props.projects.find((item) => item.id === agent.projectId);
    return {
      agent,
      projectName: project?.name ?? "Current project",
      time: agent.state === "waiting" ? "3m waiting" : index === 0 ? "8m running" : "1m running"
    };
  });

  return (
    <View style={[styles.dashboardPage, compact ? styles.dashboardPageCompact : null]}>
      <View style={[styles.welcomePanel, compact ? styles.welcomePanelCompact : null]}>
        <LinearGradient
          colors={["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.welcomeBackdrop}
        >
          <View pointerEvents="none" style={styles.welcomeHeroImageWrap}>
            <Image resizeMode="contain" source={dashboardHeroArt} style={styles.welcomeHeroImage} />
          </View>
          <View style={styles.welcomeHeroLeft}>
            <View style={styles.welcomeLivePill}>
              <View style={styles.welcomeLiveDot} />
              <Text style={styles.welcomeLiveText}>{runningProjects.length || 0} live</Text>
            </View>
            <Text style={styles.welcomeTitle}>Ready to build</Text>
            <Text style={styles.welcomeBodyText}>Launch the next thing.</Text>
          </View>
        </LinearGradient>
      </View>

      <RunningProjectsPanel
        onCreateBuild={() => props.onNavigate("chat")}
        onOpenProjects={() => props.onNavigate("projects")}
        runningProjects={runningProjects}
      />

      <View style={styles.homeActions}>
        <HomeAction icon="folder-open-outline" label="Projects" meta={`${displayProjectCount} saved workspaces`} onPress={() => props.onNavigate("projects")} />
        <HomeAction icon="chatbubble-ellipses-outline" label="AI Chat" meta="Start a build chat" onPress={() => props.onNavigate("chat")} />
        <HomeAction icon="people-outline" label="Community" meta="Explore shared ideas" onPress={() => props.onNavigate("community")} />
        <HomeAction icon="card-outline" label="Plan & Billing" meta="Manage usage and plan" onPress={() => props.onNavigate("profile")} />
      </View>
    </View>
  );
}

function RunningProjectsPanel({ onCreateBuild, onOpenProjects, runningProjects }: {
  onCreateBuild: () => void;
  onOpenProjects: () => void;
  runningProjects: Array<{
    agent: Agent;
    projectName: string;
    time: string;
  }>;
}) {
  const hasRunning = runningProjects.length > 0;

  return (
    <View style={styles.runningProjectsPanel}>
      <View style={styles.runningProjectsHeader}>
        <View style={styles.runningProjectsTitleBlock}>
          <Text style={styles.runningProjectsKicker}>Live builds</Text>
          <Text style={styles.runningProjectsTitle}>{hasRunning ? "In motion now" : "Quiet for now"}</Text>
        </View>
        <Pressable style={styles.runningProjectsOpenButton} onPress={onOpenProjects}>
          <Ionicons name="arrow-forward" color="#DAD3FF" size={18} />
        </Pressable>
      </View>

      <View style={styles.runningProjectsList}>
        {runningProjects.length > 0 ? runningProjects.map((item, index) => (
          <View key={item.agent.id} style={[styles.runningProjectCard, item.agent.state === "waiting" ? styles.runningProjectCardWaiting : styles.runningProjectCardRunning]}>
            <View style={styles.runningProjectTop}>
              <View style={[styles.runningProjectIcon, item.agent.state === "waiting" ? styles.runningProjectIconWaiting : null]}>
                <Ionicons name={item.agent.state === "waiting" ? "hourglass-outline" : "pulse-outline"} color={item.agent.state === "waiting" ? "#78F0A4" : "#C894FF"} size={20} />
              </View>
              <View style={styles.runningProjectCopy}>
                <Text numberOfLines={1} style={styles.runningProjectName}>{item.projectName}</Text>
                <Text numberOfLines={1} style={styles.runningProjectTask}>{item.agent.title}</Text>
              </View>
              <View style={[styles.runningProjectSignal, item.agent.state === "waiting" ? styles.runningProjectSignalWaiting : null]}>
                <Text style={[styles.runningProjectTime, item.agent.state === "waiting" ? styles.runningProjectTimeWaiting : null]}>{item.time}</Text>
                {item.agent.state === "waiting" ? null : <RunningProjectGraph progress={item.agent.progress} />}
              </View>
            </View>
            {item.agent.state === "waiting" ? null : (
              <View style={styles.runningProjectBeamTrack}>
                <LinearGradient
                  colors={["#8D25FF", "#C836FF", "#F2C4FF"]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[styles.runningProjectBeamFill, { width: `${Math.max(0, Math.min(item.agent.progress, 100))}%` }]}
                />
              </View>
            )}
          </View>
        )) : (
          <View style={styles.runningProjectsEmpty}>
            <View style={styles.runningProjectsEmptyGlow} />
            <View style={styles.runningProjectsEmptyIcon}>
              <Ionicons name="sparkles-outline" color="#DDBBFF" size={24} />
            </View>
            <View style={styles.runningProjectsEmptyCopy}>
              <Text style={styles.runningProjectsEmptyTitle}>No active builds</Text>
              <Text style={styles.runningProjectsEmptyText}>Your running prompts will appear here.</Text>
            </View>
            <Pressable style={({ pressed }) => [styles.runningProjectsEmptyButton, pressed ? styles.runningProjectsEmptyButtonPressed : null]} onPress={onCreateBuild}>
              <LinearGradient
                colors={["#7C2DFF", "#AA35FF", "#6C22E8"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.runningProjectsEmptyButtonGradient}
              >
                <Ionicons name="add" color={colors.text} size={18} />
                <Text style={styles.runningProjectsEmptyButtonText}>Create your first build</Text>
              </LinearGradient>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function RunningProjectGraph({ progress }: { progress: number }) {
  const normalized = Math.max(0, Math.min(progress, 100));
  const finalX = 18 + (normalized / 100) * 67;
  const graphPath = `M2 32 C8 32 8 25 14 25 C20 25 19 18 25 18 C31 18 31 23 37 23 C43 23 43 16 49 16 C55 16 55 20 61 20 C67 20 67 13 73 13 C79 13 80 9 86 7`;
  const progressPath = `M2 32 C8 32 8 25 14 25 C20 25 19 18 25 18 C31 18 31 23 37 23 C43 23 43 16 49 16 C55 16 55 20 61 20 C67 20 67 13 73 13 C79 13 80 9 86 7`;
  return (
    <View style={styles.runningProjectGraph}>
      <Svg height="48" viewBox="0 0 88 44" width="102">
        <Defs>
          <SvgGradient id="buildGraphGradient" x1="0" x2="1" y1="0" y2="0">
            <Stop offset="0" stopColor="#8C2AFF" />
            <Stop offset="0.55" stopColor="#C63BFF" />
            <Stop offset="1" stopColor="#F3B2FF" />
          </SvgGradient>
        </Defs>
        <Path d={graphPath} fill="none" opacity={0.2} stroke="#9E41F4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
        <Path d={progressPath} fill="none" opacity={0.7} stroke="url(#buildGraphGradient)" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${Math.max(10, normalized * 1.4)} 160`} strokeWidth={2.1} />
        <Path d={`M${finalX} ${Math.max(7, 32 - normalized * 0.25)} L86 7`} fill="none" opacity={normalized > 82 ? 0.55 : 0} stroke="#F3B2FF" strokeLinecap="round" strokeWidth={2} />
      </Svg>
    </View>
  );
}

function HomeAction({ icon, label, meta, badge, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  meta?: string;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.homeAction, pressed ? styles.homeActionPressed : null]} onPress={onPress}>
      <View style={styles.homeActionTop}>
        <View style={styles.homeActionIcon}>
          <Ionicons name={icon} color="#D9D0FF" size={21} />
        </View>
        <Ionicons name="chevron-forward" color="#817A9E" size={19} />
      </View>
      <Text style={styles.homeActionLabel}>{label}</Text>
      {badge ? <Text style={styles.homeActionBadge}>{badge} saved</Text> : null}
      {meta ? <Text style={styles.homeActionMeta}>{meta}</Text> : null}
    </Pressable>
  );
}

function ProjectsPage(props: {
  filteredProjects: Project[];
  onCreateProject: () => void;
  onOpenProjectChat: (projectId: string, projectName: string) => void;
  onScrollNeededChange: (needed: boolean) => void;
  onSearch: (value: string) => void;
  onSelectProject: (projectId: string) => Promise<void>;
  projectSearch: string;
  selectedProjectId: string;
}) {
  const { height, width } = useWindowDimensions();
  const projectLayout = useMemo(() => getProjectsLayout(width, height), [height, width]);
  const [archivedProjectIds, setArchivedProjectIds] = useState<Set<string>>(() => new Set());
  const [deletedProjectIds, setDeletedProjectIds] = useState<Set<string>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState<ProjectDisplay | null>(null);
  const [filterMode, setFilterMode] = useState<typeof projectFilterModes[number]>("All");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [openedProjectId, setOpenedProjectId] = useState<string | null>(null);
  const [renamedProjectNames, setRenamedProjectNames] = useState<Record<string, string>>({});
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const hasSearch = props.projectSearch.trim().length > 0;
  const baseProjects = hasSearch
    ? props.filteredProjects.map((project, index): ProjectDisplay => ({
      branch: index % 2 === 0 ? "main" : "develop",
      id: project.id,
      name: renamedProjectNames[project.id] ?? project.name,
      path: project.path,
      sourceProject: project,
      stack: project.stack,
      status: projectStatuses[index % projectStatuses.length],
      updated: `Updated ${project.updated}`
    }))
    : projectMockups.map((mockup, index) => ({
      ...mockup,
      name: renamedProjectNames[mockup.id] ?? mockup.name,
      sourceProject: props.filteredProjects[index]
    }));
  const displayProjects = baseProjects
    .filter((project) => !deletedProjectIds.has(project.id))
    .map((project) => ({
      ...project,
      status: archivedProjectIds.has(project.id) ? "Archived" as const : project.status
    }))
    .filter((project) => filterMode === "All" || project.status === filterMode);
  const estimatedCardHeight = width <= 375 ? 134 : width <= 393 ? 130 : 122;
  const estimatedProjectsHeight = 182 + 44 + 18 + 18 + 14 * 4 + displayProjects.length * estimatedCardHeight + Math.max(displayProjects.length - 1, 0) * 12;
  const availableProjectsHeight = height - 74 - 88;
  const onScrollNeededChange = props.onScrollNeededChange;

  useEffect(() => {
    onScrollNeededChange(estimatedProjectsHeight > availableProjectsHeight);
  }, [availableProjectsHeight, estimatedProjectsHeight, onScrollNeededChange]);

  function selectFilterMode(mode: typeof projectFilterModes[number]) {
    setFilterMode(mode);
    setFilterMenuOpen(false);
  }

  function openProject(project: ProjectDisplay) {
    setOpenedProjectId(project.id);
    setFilterMenuOpen(false);
    setMenuProjectId(null);
    setRenamingProjectId(null);
    const projectId = project.sourceProject?.id ?? project.id;
    if (project.sourceProject) void props.onSelectProject(project.sourceProject.id);
    props.onOpenProjectChat(projectId, project.name);
  }

  function archiveProject(projectId: string) {
    setDeletedProjectIds((current) => {
      const next = new Set(current);
      next.delete(projectId);
      return next;
    });
    setArchivedProjectIds((current) => {
      const next = new Set(current);
      next.add(projectId);
      return next;
    });
    setMenuProjectId(null);
    if (renamingProjectId === projectId) setRenamingProjectId(null);
  }

  function deleteProject(projectId: string) {
    setDeletedProjectIds((current) => new Set(current).add(projectId));
    setArchivedProjectIds((current) => {
      const next = new Set(current);
      next.delete(projectId);
      return next;
    });
    if (openedProjectId === projectId) setOpenedProjectId(null);
    if (menuProjectId === projectId) setMenuProjectId(null);
    if (renamingProjectId === projectId) setRenamingProjectId(null);
  }

  function requestDeleteProject(project: ProjectDisplay) {
    setDeleteTarget(project);
    setFilterMenuOpen(false);
    setMenuProjectId(null);
    if (renamingProjectId === project.id) setRenamingProjectId(null);
  }

  function confirmDeleteProject() {
    if (!deleteTarget) return;
    deleteProject(deleteTarget.id);
    setDeleteTarget(null);
  }

  function cancelDeleteProject() {
    setDeleteTarget(null);
  }

  function startRenameProject(project: ProjectDisplay) {
    setRenameDraft(project.name);
    setFilterMenuOpen(false);
    setRenamingProjectId(project.id);
    setMenuProjectId(null);
  }

  function submitRenameProject(projectId: string) {
    const nextName = renameDraft.trim();
    if (nextName.length > 0) {
      setRenamedProjectNames((current) => ({ ...current, [projectId]: nextName }));
    }
    setRenamingProjectId(null);
    setRenameDraft("");
  }

  function cancelRenameProject() {
    setRenamingProjectId(null);
    setRenameDraft("");
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
              <Text numberOfLines={1} style={styles.projectsCreateText}>Create Project</Text>
            </LinearGradient>
          </Pressable>
        </View>
        <Image source={projectsFoldersHero} style={[styles.projectsFoldersHero, projectLayout.heroImageStyle]} resizeMode="contain" />
      </View>

      <View style={[styles.projectsSearchRow, filterMenuOpen ? styles.projectsSearchRowMenuOpen : null]}>
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
        <View style={styles.projectsFilterWrap}>
          <Pressable style={[styles.projectsFilterButton, filterMode !== "All" ? styles.projectsFilterButtonActive : null]} onPress={() => setFilterMenuOpen((current) => !current)}>
            <Ionicons name="options-outline" color={filterMenuOpen ? "#F1ECFF" : "#B4B1C9"} size={22} />
          </Pressable>
          {filterMenuOpen ? (
            <View style={styles.projectsFilterMenu}>
              {projectFilterModes.map((mode) => (
                <ProjectFilterMenuItem
                  key={mode}
                  active={filterMode === mode}
                  label={mode}
                  onPress={() => selectFilterMode(mode)}
                />
              ))}
            </View>
          ) : null}
        </View>
      </View>

      <Text style={styles.projectsFilterLabel}>Showing {filterMode.toLowerCase()} projects</Text>

      <View style={styles.projectsList}>
        {displayProjects.map((project, index) => (
          <ProjectCard
            key={`${project.id}-${index}`}
            active={openedProjectId === project.id || project.sourceProject?.id === props.selectedProjectId}
            menuOpen={menuProjectId === project.id}
            onCancelRename={cancelRenameProject}
            onChangeRename={setRenameDraft}
            onArchive={() => archiveProject(project.id)}
            onDelete={() => requestDeleteProject(project)}
            onMore={() => setMenuProjectId((current) => current === project.id ? null : project.id)}
            onOpen={() => openProject(project)}
            onStartRename={() => startRenameProject(project)}
            onSubmitRename={() => submitRenameProject(project.id)}
            layout={projectLayout}
            project={project}
            renameValue={renameDraft}
            renaming={renamingProjectId === project.id}
          />
        ))}
        {displayProjects.length === 0 ? (
          <View style={styles.projectsEmptyState}>
            <Ionicons name="folder-open-outline" color="#8E8AA3" size={24} />
            <Text style={styles.projectsEmptyText}>No projects match this view.</Text>
          </View>
        ) : null}
      </View>
      <ProjectDeleteConfirmModal
        onCancel={cancelDeleteProject}
        onConfirm={confirmDeleteProject}
        project={deleteTarget}
      />
    </View>
  );
}

function AIChatPage(props: {
  agentRequesting: boolean;
  chatMessages: ChatMessage[];
  onBack: () => void;
  onStart: () => void;
  projectChatTitles: Record<string, string>;
  selectedChatId: string | null;
  selectedFileName: string;
  selectedModel: ModelKey;
  setSelectedChatId: (chatId: string | null) => void;
  setSelectedModel: (model: ModelKey) => void;
  setTaskText: (value: string) => void;
  taskText: string;
}) {
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [selectedChatModel, setSelectedChatModel] = useState<string>(props.selectedModel);
  const hasConversation = props.chatMessages.some((message) => message.id !== "welcome");
  const activeChat = previousChats.find((chat) => chat.id === props.selectedChatId);
  const projectChatTitle = props.selectedChatId ? props.projectChatTitles[props.selectedChatId] : undefined;
  const currentModel = chatModelOptions.find((model) => model.key === selectedChatModel) ?? chatModelOptions[0];
  const title = activeChat?.title ?? projectChatTitle ?? "New chat";

  function selectModel(model: ChatModelOption) {
    setSelectedChatModel(model.key);
    if (model.modelKey) props.setSelectedModel(model.modelKey);
    setModelMenuOpen(false);
  }

  return (
    <View style={[styles.chatPage, styles.chatActivePage]}>
      <View style={styles.chatActiveHeader}>
        <Pressable style={styles.chatBackButton} onPress={props.onBack}>
          <Ionicons name="chevron-back" color={colors.text} size={22} />
        </Pressable>
        <View style={styles.chatActiveHeaderCopy}>
          <Text numberOfLines={1} style={styles.chatActiveTitle}>{title}</Text>
        </View>
        <Pressable style={styles.chatEditButton}>
          <Ionicons name="create-outline" color="#DCD7EA" size={20} />
        </Pressable>
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
          <View style={styles.chatEmptySpace} />
        )}

        <View style={styles.chatComposerShell}>
          {modelMenuOpen ? (
            <View style={styles.chatModelMenu}>
              {chatModelGroups.map((group) => (
                <View key={group.title || "auto"} style={styles.chatModelGroup}>
                  {group.title ? <Text style={styles.chatModelGroupTitle}>{group.title}</Text> : null}
                  {group.options.map((model) => (
                    <Pressable
                      key={model.key}
                      onPress={() => selectModel(model)}
                      style={[styles.chatModelRow, selectedChatModel === model.key ? styles.chatModelRowActive : null]}
                    >
                      <ModelProviderIcon provider={model.provider} />
                      <Text numberOfLines={1} style={styles.chatModelName}>{model.label}</Text>
                      {selectedChatModel === model.key ? <Ionicons name="checkmark" color="#7CF1B3" size={18} /> : null}
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
          ) : null}
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
                  <Ionicons name="attach-outline" color="#B9B5C8" size={24} />
                </Pressable>
                <Pressable style={styles.chatModelButton} onPress={() => setModelMenuOpen((open) => !open)}>
                  <ModelProviderIcon provider={currentModel.provider} compact />
                  <Text numberOfLines={1} style={styles.chatModelButtonText}>{currentModel.label}</Text>
                  <Ionicons name={modelMenuOpen ? "chevron-down" : "chevron-up"} color="#AAA6BC" size={15} />
                </Pressable>
              </View>
              <Pressable style={styles.chatSendButton} onPress={props.agentRequesting ? undefined : props.onStart}>
                <LinearGradient
                  colors={props.agentRequesting ? ["#282B34", "#1A1C25"] : ["#8E3CFF", "#5D24D8"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.chatSendGradient}
                >
                  <Ionicons name={props.agentRequesting ? "pause" : "arrow-up"} color={colors.text} size={props.agentRequesting ? 24 : 28} />
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function ModelProviderIcon({ compact, provider }: { compact?: boolean; provider: ChatModelProvider }) {
  const config = {
    auto: { backgroundColor: "rgba(255, 255, 255, 0.08)", color: "#EDE9FF", icon: "sparkles-outline" as const },
    claude: { backgroundColor: "rgba(217, 119, 87, 0.16)", color: "#D97757", icon: "sunny-outline" as const },
    openai: { backgroundColor: "rgba(16, 163, 127, 0.16)", color: "#10A37F", icon: "aperture-outline" as const },
    gemini: { backgroundColor: "rgba(102, 126, 234, 0.18)", color: "#8EA0FF", icon: "diamond-outline" as const }
  }[provider];
  const logoSource = provider === "openai" || provider === "gemini" ? providerLogoSources[provider] : null;

  return (
    <View style={[
      styles.chatProviderIcon,
      compact ? styles.chatProviderIconCompact : null,
      { backgroundColor: config.backgroundColor }
    ]}>
      {logoSource ? (
        <Image
          resizeMode="contain"
          source={{ uri: logoSource }}
          style={[
            styles.chatProviderLogo,
            compact ? styles.chatProviderLogoCompact : null,
            provider === "openai" ? styles.chatProviderLogoOpenAi : null
          ]}
        />
      ) : (
        <Ionicons name={config.icon} color={config.color} size={compact ? 14 : 18} />
      )}
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
        <Image resizeMode="contain" source={communityHero} style={styles.communityHeroImage} />
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

function ProjectCard({
  active,
  layout,
  menuOpen,
  onArchive,
  onCancelRename,
  onChangeRename,
  onDelete,
  onMore,
  onOpen,
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
  onStartRename: () => void;
  onSubmitRename: () => void;
  project: ProjectDisplay;
  renameValue: string;
  renaming: boolean;
}) {
  const status = project.status;
  const activeStatus = status === "Active";
  const completed = status === "Completed";
  const draft = status === "Draft";
  const archived = status === "Archived";
  const projectAccent = activeStatus ? "#59E8A0" : completed ? "#BE62FF" : archived ? "#AAA6BC" : draft ? "#DAD6F6" : "#DAD6F6";
  const titleDot = activeStatus ? "#3CD783" : completed ? "#B869FF" : archived ? "#6F6A80" : "#8F8AA3";

  return (
    <View style={[
      styles.projectCard,
      layout.cardStyle,
      activeStatus ? styles.projectCardStatusActive : null,
      draft ? styles.projectCardStatusDraft : null,
      completed ? styles.projectCardStatusCompleted : null,
      archived ? styles.projectCardStatusArchived : null,
      menuOpen ? styles.projectCardMenuOpen : null
    ]}>
      <View style={[styles.projectCardMain, { gap: layout.mainGap }]}>
        <View style={[styles.projectIcon, layout.iconBoxStyle, activeStatus ? styles.projectIconActive : completed ? styles.projectIconCompleted : archived ? styles.projectIconArchived : null]}>
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
          <Text style={[
            styles.projectStatusPill,
            layout.statusStyle,
            activeStatus ? styles.projectStatusActive : null,
            draft ? styles.projectStatusDraft : null,
            completed ? styles.projectStatusCompleted : null,
            archived ? styles.projectStatusArchived : null
          ]}>{status}</Text>
          <Pressable hitSlop={8} onPress={onMore} style={styles.projectMoreButton}>
            <Ionicons name="ellipsis-vertical" color={menuOpen ? "#F1ECFF" : "#858197"} size={18} />
          </Pressable>
        </View>
      </View>
      {menuOpen ? (
        <View pointerEvents="box-none" style={styles.projectMenuLayer}>
          <View style={styles.projectMenu}>
            <ProjectMenuItem icon="create-outline" label="Rename" onPress={onStartRename} />
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

function ProjectMenuItem({ danger, icon, label, onPress }: {
  danger?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.projectMenuItem, pressed ? styles.projectMenuItemPressed : null]} onPress={onPress}>
      <Ionicons name={icon} color={danger ? "#FF7F96" : "#E8E1FF"} size={17} />
      <Text style={[styles.projectMenuItemText, danger ? styles.projectMenuItemTextDanger : null]}>{label}</Text>
    </Pressable>
  );
}

function ProjectFilterMenuItem({ active, label, onPress }: {
  active: boolean;
  label: typeof projectFilterModes[number];
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.projectsFilterMenuItem, active ? styles.projectsFilterMenuItemActive : null, pressed ? styles.projectsFilterMenuItemPressed : null]} onPress={onPress}>
      <Text style={[styles.projectsFilterMenuText, active ? styles.projectsFilterMenuTextActive : null]}>{label}</Text>
      {active ? <Ionicons name="checkmark" color="#E8E1FF" size={15} /> : null}
    </Pressable>
  );
}

function ProjectDeleteConfirmModal({ onCancel, onConfirm, project }: {
  onCancel: () => void;
  onConfirm: () => void;
  project: ProjectDisplay | null;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={project !== null}>
      <View style={styles.projectDeleteOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.projectDeleteDialog}>
          <View style={styles.projectDeleteIcon}>
            <Ionicons name="trash-outline" color="#FF8CA0" size={24} />
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
    flex: 1,
    gap: 10,
    justifyContent: "flex-end",
    minHeight: 0,
    paddingBottom: Platform.OS === "ios" ? 8 : 4
  },
  chatComposer: {
    backgroundColor: "#11131B",
    borderColor: "rgba(255, 255, 255, 0.09)",
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 104,
    padding: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 18
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
    fontWeight: "700",
    lineHeight: 20,
    maxHeight: 70,
    minHeight: 26,
    padding: 0,
    textAlignVertical: "top"
  },
  chatComposerTool: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 12,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  chatComposerTools: {
    alignItems: "center",
    flexDirection: "row",
    flex: 1,
    gap: 8,
    minWidth: 0
  },
  chatComposerShell: {
    position: "relative",
    zIndex: 10
  },
  chatModelButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 12,
    flexDirection: "row",
    gap: 7,
    height: 36,
    maxWidth: 176,
    minWidth: 0,
    paddingHorizontal: 9
  },
  chatModelButtonText: {
    color: "#DAD6E7",
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "800"
  },
  chatModelGroup: {
    gap: 2
  },
  chatModelGroupTitle: {
    color: "#8C879A",
    fontSize: 10,
    fontWeight: "900",
    paddingHorizontal: 7,
    paddingTop: 5,
    textTransform: "uppercase"
  },
  chatModelMenu: {
    backgroundColor: "#11131B",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 15,
    borderWidth: 1,
    bottom: 112,
    gap: 4,
    left: 0,
    padding: 6,
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.34,
    shadowRadius: 24,
    width: 272,
    zIndex: 20
  },
  chatModelName: {
    color: colors.text,
    flex: 1,
    fontSize: 12,
    fontWeight: "800"
  },
  chatModelRow: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 8,
    minHeight: 32,
    paddingHorizontal: 7
  },
  chatModelRowActive: {
    backgroundColor: "rgba(124, 241, 179, 0.08)"
  },
  chatActiveContent: {
    paddingBottom: Platform.OS === "ios" ? 10 : 8,
    paddingHorizontal: 12,
    paddingTop: 8
  },
  chatActiveHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 2
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
    backgroundColor: "#02030C",
    gap: 8,
    overflow: "hidden"
  },
  chatActiveTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22
  },
  chatBackButton: {
    alignItems: "center",
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  chatEditButton: {
    alignItems: "center",
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  chatEmptySpace: {
    flex: 1,
    minHeight: 0
  },
  chatBackgroundImage: {
    ...StyleSheet.absoluteFillObject,
    height: "100%",
    opacity: 0.78,
    width: "100%"
  },
  chatContent: {
    backgroundColor: "#02030C",
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
    backgroundColor: "#02030C",
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
  chatProviderIcon: {
    alignItems: "center",
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  chatProviderIconCompact: {
    height: 20,
    width: 20
  },
  chatProviderLogo: {
    height: 18,
    width: 18
  },
  chatProviderLogoCompact: {
    height: 13,
    width: 13
  },
  chatProviderLogoOpenAi: {
    tintColor: colors.text
  },
  chatSendButton: {
    borderRadius: 14,
    overflow: "hidden"
  },
  chatSendGradient: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44
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
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 138,
    paddingTop: 4
  },
  communityHeroCopy: {
    flex: 1,
    maxWidth: 320,
    minWidth: 0
  },
  communityHeroImage: {
    aspectRatio: 1536 / 1024,
    flexShrink: 1,
    height: 126,
    maxWidth: 188,
    minWidth: 112
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
    alignSelf: "stretch",
    borderRadius: 12,
    marginTop: 14,
    maxWidth: 220,
    minWidth: 178,
    overflow: "hidden",
    shadowColor: "#7130FF",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.32,
    shadowRadius: 18
  },
  projectsCreateGradient: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 16
  },
  projectsCreateText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    flexShrink: 0,
    lineHeight: 18
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
  projectsFilterMenu: {
    backgroundColor: "#0C0B18",
    borderColor: "rgba(183, 121, 255, 0.24)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 3,
    padding: 6,
    position: "absolute",
    right: 0,
    shadowColor: "#8D36FF",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    top: 50,
    width: 154,
    zIndex: 40
  },
  projectsFilterMenuItem: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 37,
    paddingHorizontal: 10
  },
  projectsFilterMenuItemActive: {
    backgroundColor: "rgba(112, 51, 255, 0.18)"
  },
  projectsFilterMenuItemPressed: {
    backgroundColor: "rgba(112, 51, 255, 0.24)"
  },
  projectsFilterMenuText: {
    color: "#C9C1DC",
    fontSize: 13,
    fontWeight: "900"
  },
  projectsFilterMenuTextActive: {
    color: "#E8E1FF"
  },
  projectsFilterWrap: {
    position: "relative",
    zIndex: 40
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
    flex: 1,
    gap: 14,
    minHeight: "100%",
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
    gap: 10,
    zIndex: 30
  },
  projectsSearchRowMenuOpen: {
    zIndex: 50
  },
  projectCard: {
    alignSelf: "stretch",
    backgroundColor: "rgba(7, 10, 20, 0.86)",
    borderColor: "rgba(128, 106, 180, 0.26)",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "visible",
    padding: 16,
    position: "relative",
    width: "100%"
  },
  projectCardActive: {
    borderColor: "rgba(79, 221, 154, 0.54)"
  },
  projectCardMenuOpen: {
    zIndex: 20
  },
  projectCardStatusActive: {
    borderColor: "rgba(89, 232, 160, 0.42)"
  },
  projectCardStatusArchived: {
    borderColor: "rgba(170, 166, 188, 0.28)"
  },
  projectCardStatusCompleted: {
    borderColor: "rgba(190, 98, 255, 0.42)"
  },
  projectCardStatusDraft: {
    borderColor: "rgba(146, 134, 174, 0.32)"
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
    paddingTop: 1,
    position: "relative",
    zIndex: 10
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
  projectDeleteActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 22,
    width: "100%"
  },
  projectDeleteBody: {
    color: "#B8B1C9",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center"
  },
  projectDeleteCancelButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(170, 166, 188, 0.2)",
    borderRadius: 11,
    borderWidth: 1,
    flex: 1,
    minHeight: 44,
    justifyContent: "center"
  },
  projectDeleteCancelText: {
    color: "#E1DAF2",
    fontSize: 14,
    fontWeight: "900"
  },
  projectDeleteConfirmButton: {
    alignItems: "center",
    backgroundColor: "#E84866",
    borderRadius: 11,
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    shadowColor: "#FF5F78",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18
  },
  projectDeleteConfirmText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  projectDeleteDialog: {
    alignItems: "center",
    backgroundColor: "#0B0A16",
    borderColor: "rgba(183, 121, 255, 0.28)",
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 342,
    padding: 22,
    shadowColor: "#0A061A",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.55,
    shadowRadius: 34,
    width: "86%"
  },
  projectDeleteIcon: {
    alignItems: "center",
    backgroundColor: "rgba(232, 72, 102, 0.14)",
    borderColor: "rgba(255, 140, 160, 0.28)",
    borderRadius: 16,
    borderWidth: 1,
    height: 52,
    justifyContent: "center",
    width: 52
  },
  projectDeleteOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(3, 4, 12, 0.78)",
    flex: 1,
    justifyContent: "center",
    padding: 22
  },
  projectDeleteTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 26,
    marginTop: 16,
    textAlign: "center"
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
  projectIconArchived: {
    backgroundColor: "rgba(82, 79, 96, 0.34)"
  },
  projectIconCompleted: {
    backgroundColor: "rgba(83, 31, 150, 0.58)"
  },
  projectMenu: {
    backgroundColor: "#0C0B18",
    borderColor: "rgba(183, 121, 255, 0.24)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 3,
    minWidth: 154,
    padding: 6,
    shadowColor: "#8D36FF",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    width: 158
  },
  projectMenuLayer: {
    alignItems: "flex-end",
    bottom: 10,
    justifyContent: "flex-start",
    left: 10,
    position: "absolute",
    right: 10,
    top: 50,
    zIndex: 30
  },
  projectMenuItem: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 10,
    minHeight: 39,
    paddingHorizontal: 10
  },
  projectMenuItemPressed: {
    backgroundColor: "rgba(112, 51, 255, 0.22)"
  },
  projectMenuItemText: {
    color: "#E8E1FF",
    fontSize: 13,
    fontWeight: "900"
  },
  projectMenuItemTextDanger: {
    color: "#FF7F96"
  },
  projectMoreButton: {
    alignItems: "center",
    backgroundColor: "rgba(23, 22, 36, 0.72)",
    borderColor: "rgba(146, 119, 205, 0.2)",
    borderRadius: 10,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    width: 28
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
  projectRenameCancelButton: {
    alignItems: "center",
    backgroundColor: "rgba(20, 22, 35, 0.78)",
    borderColor: "rgba(104, 100, 124, 0.28)",
    borderRadius: 9,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  projectRenameDoneButton: {
    alignItems: "center",
    backgroundColor: "rgba(89, 232, 160, 0.15)",
    borderColor: "rgba(89, 232, 160, 0.32)",
    borderRadius: 9,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  projectRenameDoneText: {
    color: "#8EF4BA",
    fontSize: 13,
    fontWeight: "900"
  },
  projectRenameInput: {
    backgroundColor: "rgba(21, 18, 38, 0.9)",
    borderColor: "rgba(183, 121, 255, 0.34)",
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 6
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
    borderRadius: 22,
    borderWidth: 1,
    gap: 15,
    alignSelf: "center",
    marginBottom: 18,
    marginHorizontal: 18,
    maxWidth: 430,
    paddingBottom: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    shadowColor: "#6E31FF",
    shadowOffset: { width: 0, height: -14 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    width: "91%"
  },
  pcSwitcherTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 24
  },
  planBadge: {
    fontSize: 11,
    fontWeight: "900",
    marginTop: 4,
    textTransform: "uppercase"
  },
  planButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
    overflow: "hidden"
  },
  planButtonFeatured: {
    borderWidth: 0,
    shadowColor: "#45E99B",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 18
  },
  planButtonGradient: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    width: "100%"
  },
  planButtonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }]
  },
  planButtonText: {
    color: "#E8E1FF",
    fontSize: 14,
    fontWeight: "900"
  },
  planButtonTextFeatured: {
    color: "#06100B",
    fontSize: 14,
    fontWeight: "900"
  },
  planCard: {
    backgroundColor: "rgba(11, 13, 24, 0.84)",
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
    overflow: "hidden",
    padding: 16,
    position: "relative"
  },
  planCardFeatured: {
    shadowColor: "#45E99B",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 22
  },
  planDescription: {
    color: "#B8B1C7",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18
  },
  planFeaturedWash: {
    ...StyleSheet.absoluteFillObject
  },
  planFeatureRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9
  },
  planFeatureText: {
    color: "#D8D2E4",
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18
  },
  planFeatures: {
    gap: 9
  },
  planIcon: {
    alignItems: "center",
    borderRadius: 13,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  planName: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 24
  },
  planPrice: {
    color: colors.text,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 40
  },
  planPriceMeta: {
    color: "#AFA8C0",
    fontSize: 14,
    fontWeight: "900",
    paddingBottom: 6
  },
  planPriceRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 4
  },
  planTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
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
  tokenCompactMeta: {
    color: "#AFA8C0",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
    textAlign: "center"
  },
  tokenCompactPanel: {
    alignItems: "center",
    backgroundColor: "rgba(255, 231, 106, 0.08)",
    borderColor: "rgba(255, 231, 106, 0.18)",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  tokenCompactPercent: {
    color: "#FFF2A4",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19
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
    minHeight: 46
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
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
    marginBottom: 18,
    marginHorizontal: 18,
    maxWidth: 390,
    padding: 16,
    alignSelf: "center",
    shadowColor: "#6E31FF",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    width: "91%"
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
    backgroundColor: "rgba(255, 231, 106, 0.12)",
    borderColor: "rgba(255, 231, 106, 0.22)",
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
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 32
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
    backgroundColor: "rgba(15, 18, 31, 0.88)",
    borderColor: "rgba(112, 240, 162, 0.18)",
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 11,
    minHeight: 52,
    minWidth: 0,
    paddingHorizontal: 10,
    shadowColor: "#1EEA7B",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 16
  },
  topLeftPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }]
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
  upgradeBackButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  upgradeContent: {
    paddingBottom: Platform.OS === "ios" ? 96 : 90,
    paddingHorizontal: 14,
    paddingTop: 8
  },
  upgradeCycleControl: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    padding: 5
  },
  upgradeCycleOption: {
    alignItems: "center",
    borderRadius: 12,
    flex: 1,
    justifyContent: "center",
    minHeight: 48
  },
  upgradeCycleOptionActive: {
    backgroundColor: "rgba(69, 233, 155, 0.14)",
    borderColor: "rgba(69, 233, 155, 0.26)",
    borderWidth: 1
  },
  upgradeCycleSave: {
    color: "#7CF1B3",
    fontSize: 10,
    fontWeight: "900",
    marginTop: 2
  },
  upgradeCycleText: {
    color: "#AFA8C0",
    fontSize: 14,
    fontWeight: "900"
  },
  upgradeCycleTextActive: {
    color: colors.text
  },
  upgradeHeader: {
    flexDirection: "row",
    gap: 12
  },
  upgradeHeaderCopy: {
    flex: 1,
    minWidth: 0
  },
  upgradeKicker: {
    color: "#7CF1B3",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  upgradePage: {
    gap: 16,
    width: "100%"
  },
  upgradePlans: {
    gap: 12
  },
  upgradeSubtitle: {
    color: "#B8B1C7",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
    marginTop: 8
  },
  upgradeTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 32,
    marginTop: 4
  },
  welcomeBodyText: {
    color: "#B5B0CA",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 6,
    textAlign: "left"
  },
  welcomePanel: {
    minHeight: 182,
    overflow: "visible"
  },
  welcomePanelCompact: {
    minHeight: 158
  },
  welcomeBackdrop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 18,
    justifyContent: "space-between",
    minHeight: "100%",
    overflow: "visible",
    paddingTop: 8,
    width: "100%"
  },
  welcomeHeroImage: {
    aspectRatio: 1,
    height: "100%",
    opacity: 0.92,
    width: "100%"
  },
  welcomeHeroImageWrap: {
    bottom: -18,
    height: 190,
    position: "absolute",
    right: -32,
    width: 212
  },
  welcomeHeroLeft: {
    maxWidth: 210,
    minWidth: 0,
    zIndex: 1
  },
  welcomeLiveDot: {
    backgroundColor: "#68F8A6",
    borderRadius: 999,
    height: 8,
    width: 8
  },
  welcomeLivePill: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 7,
    marginBottom: 14,
    paddingVertical: 2
  },
  welcomeLiveText: {
    color: "#D7D1E7",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  welcomeTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 32,
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
    gap: 14,
    width: "100%"
  },
  dashboardPageCompact: {
    gap: 10
  },
  dashboardLogo: {
    height: 36,
    width: 52
  },
  runningProjectCard: {
    backgroundColor: "rgba(8, 6, 20, 0.58)",
    borderRadius: 12,
    borderWidth: 1,
    height: 98,
    overflow: "hidden",
    paddingHorizontal: 10,
    position: "relative"
  },
  runningProjectCardRunning: {
    backgroundColor: "rgba(78, 20, 137, 0.14)",
    borderColor: "rgba(179, 91, 255, 0.58)",
    paddingBottom: 20,
    paddingTop: 13,
    shadowColor: "#7F24FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.36,
    shadowRadius: 18
  },
  runningProjectCardWaiting: {
    backgroundColor: "rgba(27, 114, 66, 0.12)",
    borderColor: "rgba(105, 239, 151, 0.48)",
    justifyContent: "center",
    paddingBottom: 0,
    paddingTop: 0,
    shadowColor: "#45E986",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.26,
    shadowRadius: 16
  },
  runningProjectCopy: {
    flex: 1,
    minWidth: 0
  },
  runningProjectIcon: {
    alignItems: "center",
    backgroundColor: "rgba(42, 207, 194, 0.18)",
    borderColor: "rgba(78, 238, 220, 0.16)",
    borderRadius: 9,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    shadowColor: "#2EEFD8",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    width: 36
  },
  runningProjectIconWaiting: {
    backgroundColor: "rgba(81, 235, 139, 0.14)",
    borderColor: "rgba(131, 242, 173, 0.18)",
    shadowColor: "#63F29D"
  },
  runningProjectName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 18
  },
  runningProjectGraph: {
    height: 48,
    marginTop: 2,
    width: 102
  },
  runningProjectBeamFill: {
    borderRadius: 999,
    height: "100%",
    shadowColor: "#F2B3FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 7
  },
  runningProjectBeamTrack: {
    backgroundColor: "rgba(118, 43, 190, 0.36)",
    borderRadius: 999,
    bottom: 13,
    height: 5,
    left: 14,
    overflow: "hidden",
    position: "absolute",
    right: 128
  },
  runningProjectsEmpty: {
    alignItems: "center",
    backgroundColor: "rgba(13, 8, 28, 0.62)",
    borderColor: "rgba(176, 102, 255, 0.32)",
    borderRadius: 16,
    borderWidth: 1,
    gap: 11,
    justifyContent: "center",
    minHeight: 205,
    overflow: "hidden",
    paddingHorizontal: 18,
    paddingVertical: 18,
    position: "relative",
    shadowColor: "#7F24FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 18
  },
  runningProjectsEmptyButton: {
    borderRadius: 12,
    marginTop: 2,
    overflow: "hidden",
    shadowColor: "#9631FF",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.26,
    shadowRadius: 16
  },
  runningProjectsEmptyButtonGradient: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 15
  },
  runningProjectsEmptyButtonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }]
  },
  runningProjectsEmptyButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17
  },
  runningProjectsEmptyCopy: {
    alignItems: "center",
    maxWidth: 250
  },
  runningProjectsEmptyGlow: {
    backgroundColor: "rgba(164, 58, 255, 0.22)",
    borderRadius: 999,
    height: 120,
    position: "absolute",
    shadowColor: "#A43AFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 42,
    top: -70,
    width: 180
  },
  runningProjectsEmptyIcon: {
    alignItems: "center",
    backgroundColor: "rgba(122, 47, 255, 0.2)",
    borderColor: "rgba(216, 184, 255, 0.2)",
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  runningProjectsEmptyText: {
    color: "#BFB7D0",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 5,
    textAlign: "center"
  },
  runningProjectsEmptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 22,
    textAlign: "center"
  },
  runningProjectsHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  runningProjectsKicker: {
    color: "#B977FF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  runningProjectsList: {
    gap: 9
  },
  runningProjectsOpenButton: {
    alignItems: "center",
    height: 34,
    justifyContent: "center",
    width: 34
  },
  runningProjectsPanel: {
    gap: 10
  },
  runningProjectsTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 24,
    marginTop: 2
  },
  runningProjectsTitleBlock: {
    minWidth: 0
  },
  runningProjectTask: {
    color: "#C8BFE0",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 15,
    marginTop: 2
  },
  runningProjectTime: {
    backgroundColor: "rgba(42, 9, 75, 0.86)",
    borderColor: "rgba(172, 58, 255, 0.42)",
    borderRadius: 999,
    borderWidth: 1,
    color: "#F0B8FF",
    fontSize: 9,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    textAlign: "right",
    textTransform: "lowercase"
  },
  runningProjectTimeWaiting: {
    backgroundColor: "rgba(7, 48, 30, 0.82)",
    borderColor: "rgba(117, 244, 166, 0.34)",
    color: "#83F2AD"
  },
  runningProjectTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9
  },
  runningProjectSignal: {
    alignItems: "flex-end",
    alignSelf: "stretch",
    justifyContent: "flex-start",
    minWidth: 112
  },
  runningProjectSignalWaiting: {
    alignSelf: "auto",
    justifyContent: "center"
  },
  homeActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between"
  },
  homeAction: {
    backgroundColor: "rgba(12, 15, 28, 0.64)",
    borderColor: "rgba(119, 103, 157, 0.18)",
    borderRadius: 16,
    borderWidth: 1,
    height: 132,
    justifyContent: "space-between",
    padding: 15,
    width: "48.5%"
  },
  homeActionBadge: {
    color: "#9E98B5",
    fontSize: 11,
    fontWeight: "900",
    marginTop: 4
  },
  homeActionIcon: {
    alignItems: "center",
    backgroundColor: "rgba(82, 45, 154, 0.38)",
    borderColor: "rgba(164, 110, 255, 0.22)",
    borderRadius: 12,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  homeActionLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 18,
    marginTop: 10
  },
  homeActionMeta: {
    color: "#A9A7BB",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    marginTop: 4,
    minHeight: 28
  },
  homeActionPressed: {
    backgroundColor: "rgba(23, 20, 43, 0.78)",
    borderColor: "rgba(164, 110, 255, 0.32)",
    transform: [{ scale: 0.99 }]
  },
  homeActionTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  }
});
