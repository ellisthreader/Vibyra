import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  ImageBackground,
  ImageStyle,
  KeyboardAvoidingView,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from "react-native-svg";
import { AppWebView } from "../components/AppWebView";
import { VibyraLogo } from "../components/VibyraLogo";
import { useAppContext } from "../context/AppContext";
import { colors } from "../styles/theme";
import { Agent, ChatMessage, GeneratedApp, ModelKey, Project, RememberedDesktop } from "../types/domain";
import { appApiRequest } from "../utils/appApi";
import { fetchWithTimeout, normalizeAgentUrl } from "../utils/network";

const dashboardHeroArt = require("../assets/BG-transparent-vibyra.png");
const aiChatGlyph = require("../assets/ai-chat-glyph-focused.png");
const chatBuildAiHero = require("../assets/chat-build-ai-hero.png");
const vibyraLogo = require("../assets/vibyra.png");
const projectsBackdrop = require("../assets/result-background.png");
const projectsFoldersHero = require("../assets/projects-folders-hero-glow-transparent.png");
const communityHero = require("../assets/community-hero-glow-transparent.png");
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
const projectFilterModes = ["All", "PC", "Mobile"] as const;
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

const previousChats = [
  { detail: "Edited hero.tsx", icon: "chatbubble-ellipses-outline" as const, id: "landing-polish", meta: "Current chat", running: true, time: "2 mins ago", title: "Landing page polish" },
  { detail: "Investigating login issue", icon: "bug-outline" as const, id: "auth-bug", meta: "Saved 2d ago", running: false, time: "2d ago", title: "Fix auth bug" },
  { detail: "Refactoring components", icon: "chatbubble-ellipses-outline" as const, id: "pricing-page", meta: "Saved 5d ago", running: false, time: "5d ago", title: "SaaS pricing page" },
  { detail: "Optimising queries", icon: "bug-outline" as const, id: "database-optimisation", meta: "Saved 1w ago", running: true, time: "1w ago", title: "Database optimisation" }
];

const chatSuggestions = [
  { description: "Find & resolve\nissues", icon: "construct-outline" as const, title: "Fix a bug" },
  { description: "Add something\nnew", icon: "cube-outline" as const, title: "Build a feature" },
  { description: "Improve code\nquality", icon: "code-slash-outline" as const, title: "Refactor code" },
  { description: "Prepare and\ndeploy", icon: "rocket-outline" as const, title: "Ship it" }
];

type ChatModelProvider = "auto" | "claude" | "openai" | "gemini";
type ChatModelOption = {
  badge?: "New";
  key: string;
  label: string;
  locked?: boolean;
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
      { badge: "New", key: "claude-opus-4", label: "Claude Opus 4", locked: true, provider: "claude" },
      { key: "claude-sonnet-4", label: "Claude Sonnet 4", locked: true, provider: "claude" },
      { key: "claude-3-5-haiku", label: "Claude Haiku 3.5", provider: "claude" }
    ]
  },
  {
    title: "OpenAI models",
    options: [
      { badge: "New", key: "gpt-5.5", label: "GPT-5.5", locked: true, provider: "openai", modelKey: "gpt-5.5" },
      { key: "gpt-5.4", label: "GPT-5.4", locked: true, provider: "openai", modelKey: "gpt-5.4" },
      { key: "gpt-5.4-mini", label: "GPT-5.4 Mini", provider: "openai", modelKey: "gpt-5.4-mini" },
      { key: "gpt-5-codex", label: "GPT-5 Codex", locked: true, provider: "openai", modelKey: "gpt-5-codex" }
    ]
  },
  {
    title: "Gemini Models",
    options: [
      { badge: "New", key: "gemini-2.5-pro", label: "Gemini 2.5 Pro", locked: true, provider: "gemini" },
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

type CommunityLogoKind = "analytics" | "default" | "habit" | "invoice";
type CommunityPreviewKind = "analytics" | "habit" | "invoice";
type CommunityFilter = "All" | "Recent" | "Popular" | "Featured";
type CommunityDetailTab = "about" | "comments";
type CommunityComment = {
  id: string;
  name: string;
  text: string;
  time: string;
};
type CommunityPost = {
  accent: string;
  appUrl: string;
  about: string;
  comments: number;
  description: string;
  id: string;
  likes: number;
  logo?: CommunityLogoKind;
  makerBio: string;
  preview: CommunityPreviewKind;
  screenshots: string[];
  tag: CommunityFilter;
  tags: string[];
  time: string;
  title: string;
  user: string;
};

const communityDetailAccent = "#8B35FF";
const communityDetailAccentDark = "#5D24D8";

const communityPosts: CommunityPost[] = [
  {
    accent: "#9B5CFF",
    appUrl: "https://vibyra.app/community/ai-invoice-tool",
    about: "AI Invoice Tool helps freelancers and SaaS teams turn rough billing notes into polished invoices, follow-up emails, and payment summaries. It is built for quick client work where accuracy, presentation, and speed matter.",
    comments: 9,
    description: "Automate invoices and billing with AI. Save hours of work.",
    id: "ai-invoice-tool",
    likes: 42,
    logo: "invoice" as const,
    makerBio: "Maya is a product designer building calm finance tools for independent studios.",
    preview: "invoice" as const,
    screenshots: ["Invoice dashboard", "Client payment timeline", "AI billing assistant"],
    tag: "Popular",
    tags: ["SaaS", "AI"],
    time: "2h ago",
    title: "AI invoice tool",
    user: "Maya"
  },
  {
    accent: "#51E895",
    appUrl: "https://vibyra.app/community/habit-tracker-app",
    about: "Habit Tracker App turns tiny daily goals into a simple rhythm with streaks, reminders, reflection prompts, and progress summaries that are easy to scan at a glance.",
    comments: 4,
    description: "Track habits, build consistency, and achieve your goals.",
    id: "habit-tracker-app",
    likes: 18,
    logo: "habit" as const,
    makerBio: "Noah builds wellness utilities with soft visuals and practical routines.",
    preview: "habit" as const,
    screenshots: ["Daily streak board", "Weekly reflection", "Goal setup flow"],
    tag: "Recent",
    tags: ["Productivity", "Health"],
    time: "5h ago",
    title: "Habit tracker app",
    user: "Noah"
  },
  {
    accent: "#5792FF",
    appUrl: "https://vibyra.app/community/saas-analytics-board",
    about: "SaaS Analytics Board gives founders a clean view of revenue, activation, retention, and churn signals without needing a heavy BI setup.",
    comments: 6,
    description: "Beautiful analytics dashboard for SaaS founders.",
    id: "saas-analytics-board",
    likes: 31,
    logo: "analytics" as const,
    makerBio: "Leah is a full-stack maker focused on decision tools for early-stage teams.",
    preview: "analytics" as const,
    screenshots: ["Revenue overview", "Retention health", "Founder weekly brief"],
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
      heroImageStyle: styles.projectsFoldersHeroCompact as ImageStyle,
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
      heroImageStyle: styles.projectsFoldersHeroNarrow as ImageStyle,
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
      heroImageStyle: styles.projectsFoldersHeroComfort as ImageStyle,
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

export function WorkspaceScreen() {
  const app = useAppContext();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 420;
  const [activePage, setActivePage] = useState<DashboardPage>("dashboard");
  const [desktopCandidates, setDesktopCandidates] = useState<DesktopCandidate[]>(app.rememberedDesktops);
  const [pcSwitcherVisible, setPcSwitcherVisible] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [switcherScanning, setSwitcherScanning] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatTitleOverrides, setChatTitleOverrides] = useState<Record<string, string>>({});
  const [renameChatVisible, setRenameChatVisible] = useState(false);
  const [renameChatDraft, setRenameChatDraft] = useState("");
  const [projectChatTitles, setProjectChatTitles] = useState<Record<string, string>>({});
  const [tokenSheetVisible, setTokenSheetVisible] = useState(false);
  const [projectsCanScroll, setProjectsCanScroll] = useState(false);
  const [selectedCommunityPost, setSelectedCommunityPost] = useState<CommunityPost | null>(null);
  const [openedCommunityPostId, setOpenedCommunityPostId] = useState<string | null>(null);
  const [previewApp, setPreviewApp] = useState<GeneratedApp | null>(null);
  const [desktopFolders, setDesktopFolders] = useState<Project[]>([]);
  const [folderConfirm, setFolderConfirm] = useState<{ query: string; matches: Project[] } | null>(null);

  const filteredProjects = useMemo(() => {
    const search = projectSearch.trim().toLowerCase();
    if (!search) return app.projects;
    return app.projects.filter((project) => (
      project.name.toLowerCase().includes(search) ||
      project.path.toLowerCase().includes(search) ||
      project.stack.toLowerCase().includes(search)
    ));
  }, [app.projects, projectSearch]);

  const filteredDesktopFolders = useMemo(() => {
    const search = projectSearch.trim().toLowerCase();
    if (!search) return desktopFolders;
    return desktopFolders.filter((folder) => (
      folder.name.toLowerCase().includes(search) ||
      folder.path.toLowerCase().includes(search) ||
      (folder.stack ?? "").toLowerCase().includes(search)
    ));
  }, [desktopFolders, projectSearch]);

  useEffect(() => {
    if (!app.connection) {
      setDesktopFolders([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const folders = await app.loadDesktopFolders();
      if (!cancelled) setDesktopFolders(folders);
    })();
    return () => { cancelled = true; };
  }, [app, app.connection]);

  const isConnected = Boolean(app.connection);
  const lastRememberedDesktop = app.rememberedDesktops.find((desktop) => desktop.lastConnectedAt) ?? app.rememberedDesktops[0];
  const connectedMachineName = app.connection?.machineName ?? lastRememberedDesktop?.machineName ?? app.machineName;
  const autoReconnectAttempted = useRef(false);

  useEffect(() => {
    if (isConnected) return;
    if (autoReconnectAttempted.current) return;
    if (!lastRememberedDesktop?.lastConnectedAt) return;
    autoReconnectAttempted.current = true;

    let cancelled = false;
    (async () => {
      const currentPairCode = await getCurrentDesktopPairCode(lastRememberedDesktop.url);
      if (cancelled || !currentPairCode) return;
      await app.pairMachineAt(lastRememberedDesktop.url, currentPairCode);
    })();

    return () => {
      cancelled = true;
    };
  }, [app, isConnected, lastRememberedDesktop]);
  const tokenBalance = 5;
  const creditAllowance = Math.max(tokenBalance + app.creditsUsed, app.accountPlan === "free" ? 50 : tokenMembership.allowance);
  const creditPercentRemaining = creditAllowance > 0 ? Math.round((tokenBalance / creditAllowance) * 100) : 0;
  const creditsLow = creditAllowance > 0 && tokenBalance / creditAllowance < 0.1;
  const activeChat = previousChats.find((chat) => chat.id === selectedChatId);
  const selectedChatProjectId = selectedChatId?.startsWith("project-") ? selectedChatId.replace("project-", "") : null;
  const projectChatTitle = selectedChatProjectId ? app.chatTitles[selectedChatProjectId] ?? projectChatTitles[selectedChatId ?? ""] : undefined;
  const chatTitleKey = selectedChatId ?? "new-chat";
  const chatTitle = chatTitleOverrides[chatTitleKey] ?? activeChat?.title ?? projectChatTitle ?? "New chat";

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
    const title = app.chatTitles[projectId] ?? projectName;
    setProjectChatTitles((current) => ({ ...current, [chatId]: title }));
    setSelectedChatId(chatId);
    setActivePage("chat");
  }, [app.chatTitles]);

  const openProjectPreview = useCallback(async (projectId: string, projectName: string) => {
    await app.selectProject(projectId);

    if (!app.connection) {
      openProjectChat(projectId, projectName);
      return;
    }

    const previewUrl = projectPreviewUrl(app.connection.url, projectId, app.connection.token);
    try {
      await Linking.openURL(previewUrl);
    } catch {
      openProjectChat(projectId, projectName);
    }
  }, [app, openProjectChat]);

  const createProjectAndOpenChat = useCallback(async () => {
    const project = await app.createProject();
    if (!project) return;
    openProjectChat(project.id, app.chatTitles[project.id] ?? project.name);
  }, [app, openProjectChat]);

  const promptReferencesPcFolder = useCallback((prompt: string) => {
    const text = prompt.toLowerCase();
    if (/(on|in)\s+(my\s+)?(desktop|pc|computer|mac|machine)/.test(text)) return true;
    if (/(open|find|use|locate|look\s+(at|in)|switch\s+to|start\s+(coding|working)\s+(on|in)|work\s+(on|in))\s+(the\s+)?[\w\- .]+\s+(folder|repo|repository|project|directory|app|codebase)/.test(text)) return true;
    if (/(the|my)\s+[\w\- .]+\s+(folder|repo|repository|project|directory|app|codebase)\b/.test(text)) return true;
    return false;
  }, []);

  const onStartChat = useCallback(async () => {
    const prompt = app.taskText.trim();
    if (!prompt) return;
    if (!app.connection || !promptReferencesPcFolder(prompt)) {
      await app.startAgent();
      return;
    }
    const matches = await app.searchDesktopFolders(prompt);
    if (matches.length === 0) {
      await app.startAgent();
      return;
    }
    const selectedPath = app.selectedProject?.path;
    const alreadyOnTopMatch = matches[0]?.path && matches[0].path === selectedPath;
    if (alreadyOnTopMatch) {
      await app.startAgent();
      return;
    }
    setFolderConfirm({ query: prompt, matches });
  }, [app, promptReferencesPcFolder]);

  const acceptFolderConfirm = useCallback(async (folder: Project) => {
    setFolderConfirm(null);
    await app.adoptProject(folder);
    await app.startAgent();
  }, [app]);

  const skipFolderConfirm = useCallback(async () => {
    setFolderConfirm(null);
    await app.startAgent();
  }, [app]);

  const cancelFolderConfirm = useCallback(() => {
    setFolderConfirm(null);
  }, []);

  const openRenameChat = useCallback(() => {
    setRenameChatDraft(chatTitle);
    setRenameChatVisible(true);
  }, [chatTitle]);

  const saveRenameChat = useCallback(() => {
    const nextTitle = renameChatDraft.trim();
    if (nextTitle) {
      setChatTitleOverrides((current) => ({ ...current, [chatTitleKey]: nextTitle }));
      if (selectedChatId?.startsWith("project-")) {
        setProjectChatTitles((current) => ({ ...current, [selectedChatId]: nextTitle }));
      }
    }
    setRenameChatVisible(false);
  }, [chatTitleKey, renameChatDraft, selectedChatId]);

  const deleteCurrentChat = useCallback(() => {
    setChatTitleOverrides((current) => {
      const next = { ...current };
      delete next[chatTitleKey];
      return next;
    });
    if (selectedChatId) {
      setProjectChatTitles((current) => {
        const next = { ...current };
        delete next[selectedChatId];
        return next;
      });
    }
    setSelectedChatId(null);
    app.setTaskText("");
    setActivePage("dashboard");
  }, [app, chatTitleKey, selectedChatId]);

  const backFromCommunitySubPage = useCallback(() => {
    if (openedCommunityPostId) {
      setOpenedCommunityPostId(null);
      return;
    }

    setSelectedCommunityPost(null);
  }, [openedCommunityPostId]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
      <View style={styles.shell}>
        <View style={styles.main}>
          <TopBar
            activePage={activePage}
            chatTitle={chatTitle}
            compact={compact}
            communitySubPageTitle={selectedCommunityPost ? formatCommunityTitle(selectedCommunityPost.title) : ""}
            isConnected={isConnected}
            machineName={connectedMachineName}
            onBackFromChat={() => {
              setSelectedChatId(null);
              setActivePage("dashboard");
            }}
            onBackFromCommunity={backFromCommunitySubPage}
            onDeleteChat={deleteCurrentChat}
            onOpenPcSwitcher={openPcSwitcher}
            onOpenTokens={() => setTokenSheetVisible(true)}
            onRenameChat={openRenameChat}
            tokenBalance={tokenBalance}
          />
          {activePage === "chat" ? (
            <View style={styles.chatPageHost}>
              <AIChatPage
                bottomInset={insets.bottom}
                onOpenApp={setPreviewApp}
                agentRequesting={app.agentRequesting}
                chatMessages={app.chatMessages}
                creditsLow={creditsLow}
                creditPercentRemaining={creditPercentRemaining}
                onOpenTokens={() => setTokenSheetVisible(true)}
                onStart={onStartChat}
                selectedChatId={selectedChatId}
                projectChatTitles={projectChatTitles}
                selectedFileName={app.selectedFile.name}
                selectedChatModel={app.selectedChatModel}
                selectedModel={app.selectedModel}
                accountPlan={app.accountPlan}
                setSelectedChatId={setSelectedChatId}
                setSelectedChatModel={app.setSelectedChatModel}
                setSelectedModel={app.setSelectedModel}
                setTaskText={app.setTaskText}
                taskText={app.taskText}
              />
            </View>
          ) : (
            <ScrollView
              style={styles.contentScroll}
              contentContainerStyle={[
                styles.content,
                activePage === "dashboard" ? styles.dashboardContent : null,
                activePage === "projects" ? styles.projectsContent : null,
                activePage === "profile" ? styles.profileContent : null,
                { minHeight: Math.max(height - (activePage === "dashboard" ? 190 : 72), 0) }
              ]}
              bounces={activePage === "projects" ? projectsCanScroll : true}
              scrollEnabled={activePage === "projects" ? projectsCanScroll : activePage === "community" ? true : activePage !== "dashboard"}
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
                  tokenBalance={tokenBalance}
                />
              ) : null}

              {activePage === "projects" ? (
                <ProjectsPage
                  connected={Boolean(app.connection)}
                  desktopFolders={filteredDesktopFolders}
                  filteredProjects={filteredProjects}
                  onCreateProject={createProjectAndOpenChat}
                  onOpenProjectPreview={openProjectPreview}
                  onSearch={setProjectSearch}
                  onScrollNeededChange={setProjectsCanScroll}
                  projectSearch={projectSearch}
                  selectedProjectId={app.selectedProject.id}
                />
              ) : null}

              {activePage === "community" ? (
                <CommunityPage
                  authToken={app.authToken}
                  currentUserName={app.authName}
                  openedPostId={openedCommunityPostId}
                  onOpenApp={(postId) => setOpenedCommunityPostId(postId)}
                  onSelectPost={setSelectedCommunityPost}
                  selectedPost={selectedCommunityPost}
                />
              ) : null}

              {activePage === "profile" ? (
                <ProfilePage
                  activeTab={settingsTab}
                  accountPlan={app.accountPlan}
                  creditsBalance={tokenBalance}
                  email={app.authEmail || "you@vibyra.app"}
                  machineName={app.machineName}
                  name={app.authName}
                  onTabChange={setSettingsTab}
                  projectCount={app.projects.length}
                  selectedModel={app.selectedModel}
                />
              ) : null}
            </ScrollView>
          )}
        </View>
        {activePage === "chat" ? null : <BottomNav activePage={activePage} onChange={setActivePage} />}
        <PcSwitcherSheet
          candidates={desktopCandidates}
          connectedUrl={app.connection?.url}
          connectedMachineName={app.connection?.machineName}
          currentMachineName={connectedMachineName}
          isConnected={isConnected}
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
          pairingMessage={app.pairingMessage}
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
          plan={app.accountPlan}
          tokenBalance={tokenBalance}
          tokensUsed={app.creditsUsed}
          visible={tokenSheetVisible}
        />
        <RenameChatModal
          draft={renameChatDraft}
          onCancel={() => setRenameChatVisible(false)}
          onChangeDraft={setRenameChatDraft}
          onSave={saveRenameChat}
          visible={renameChatVisible}
        />
        <AppPreviewModal app={previewApp} onClose={() => setPreviewApp(null)} />
        <FolderConfirmModal
          confirm={folderConfirm}
          onAccept={acceptFolderConfirm}
          onCancel={cancelFolderConfirm}
          onSkip={skipFolderConfirm}
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

function TopBar({
  activePage,
  chatTitle,
  compact,
  communitySubPageTitle,
  isConnected,
  machineName,
  onBackFromChat,
  onBackFromCommunity,
  onDeleteChat,
  onOpenPcSwitcher,
  onOpenTokens,
  onRenameChat,
  tokenBalance
}: {
  activePage: DashboardPage;
  chatTitle: string;
  compact: boolean;
  communitySubPageTitle: string;
  isConnected: boolean;
  machineName: string;
  onBackFromChat: () => void;
  onBackFromCommunity: () => void;
  onDeleteChat: () => void;
  onOpenPcSwitcher: () => void;
  onOpenTokens: () => void;
  onRenameChat: () => void;
  tokenBalance: number;
}) {
  const title = getTopBarTitle(activePage);

  if (activePage === "chat") {
    return (
      <View style={[styles.topBar, styles.chatTopBar]}>
        <View style={styles.chatTopLeft}>
          <Pressable accessibilityLabel="Back to home" style={styles.chatTopIconButton} onPress={onBackFromChat}>
            <Ionicons name="chevron-back" color={colors.text} size={26} />
          </Pressable>
        </View>
        <View pointerEvents="none" style={styles.chatTopTitleWrap}>
          <Text numberOfLines={1} style={styles.chatTopTitle}>{chatTitle}</Text>
        </View>
        <View style={styles.chatTopActions}>
          <Pressable accessibilityLabel="Rename chat" style={styles.chatTopIconButton} onPress={onRenameChat}>
            <Ionicons name="create-outline" color="#DCD7EA" size={22} />
          </Pressable>
          <Pressable accessibilityLabel="Delete chat" style={styles.chatTopIconButton} onPress={onDeleteChat}>
            <Ionicons name="trash-outline" color="#FF9DAE" size={22} />
          </Pressable>
        </View>
      </View>
    );
  }

  if (activePage === "community" && communitySubPageTitle) {
    return (
      <View style={[styles.topBar, styles.chatTopBar]}>
        <View style={styles.chatTopLeft}>
          <Pressable accessibilityLabel="Back to community" style={styles.chatTopIconButton} onPress={onBackFromCommunity}>
            <Ionicons name="chevron-back" color={colors.text} size={26} />
          </Pressable>
        </View>
        <View pointerEvents="none" style={styles.chatTopTitleWrap}>
          <Text numberOfLines={1} style={styles.chatTopTitle}>{communitySubPageTitle}</Text>
        </View>
        <View style={styles.chatTopActions}>
          <TokenBalancePill compact={compact} onOpenTokens={onOpenTokens} tokenBalance={tokenBalance} />
        </View>
      </View>
    );
  }

  if (activePage !== "dashboard") {
    return (
      <View style={styles.topBar}>
        <View style={styles.pageTopTitleBlock}>
          <Text numberOfLines={1} style={styles.pageTopTitle}>{title}</Text>
        </View>
        <View style={styles.topRight}>
          <TokenBalancePill compact={compact} onOpenTokens={onOpenTokens} tokenBalance={tokenBalance} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change connected PC"
        hitSlop={8}
        onPress={onOpenPcSwitcher}
        style={({ pressed }) => [styles.topLeft, pressed ? styles.topLeftPressed : null]}
      >
        <VibyraLogo compact style={styles.dashboardLogo as ImageStyle} />
        <View style={styles.topMachineCopy}>
          <View style={styles.topConnectionRow}>
            <View style={[styles.statusDot, isConnected ? null : styles.statusDotOffline]} />
            <Text style={styles.topKicker}>{isConnected ? "Connected to PC" : "Not connected"}</Text>
          </View>
          <View style={styles.topTitleRow}>
            <Text numberOfLines={1} style={styles.topTitle}>{machineName}</Text>
            <Ionicons name="chevron-down" color="#A9A6BE" size={16} />
          </View>
        </View>
      </Pressable>
      <View style={styles.topRight}>
        <TokenBalancePill compact={compact} onOpenTokens={onOpenTokens} tokenBalance={tokenBalance} />
      </View>
    </View>
  );
}

function TokenBalancePill({ compact, onOpenTokens, tokenBalance }: {
  compact: boolean;
  onOpenTokens: () => void;
  tokenBalance: number;
}) {
  return (
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
  );
}

function getTopBarTitle(page: DashboardPage) {
  if (page === "projects") return "Projects";
  if (page === "community") return "Community";
  if (page === "profile") return "Profile";
  if (page === "chat") return "AI Chat";
  return "Home";
}

function projectPreviewUrl(baseUrl: string, projectId: string, token: string) {
  return `${normalizeAgentUrl(baseUrl)}/preview/project/${encodeURIComponent(projectId)}/${encodeURIComponent(token)}/`;
}

async function getCurrentDesktopPairCode(url: string): Promise<string | null> {
  try {
    const timeoutMs = url.startsWith("https://") ? 1400 : 900;
    const response = await fetchWithTimeout(`${url}/health`, {}, timeoutMs);
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload?.ok) return null;
    const pairCode = String(payload?.pairCode ?? "").toUpperCase();
    return pairCode || null;
  } catch {
    return null;
  }
}

function RenameChatModal({ draft, onCancel, onChangeDraft, onSave, visible }: {
  draft: string;
  onCancel: () => void;
  onChangeDraft: (value: string) => void;
  onSave: () => void;
  visible: boolean;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.renameChatOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.renameChatDialog}>
          <View style={styles.renameChatHeader}>
            <View style={styles.renameChatIcon}>
              <Ionicons name="create-outline" color="#DCD7EA" size={22} />
            </View>
            <View style={styles.renameChatCopy}>
              <Text style={styles.renameChatTitle}>Rename chat</Text>
              <Text style={styles.renameChatSubtitle}>Give this chat a clearer title.</Text>
            </View>
          </View>
          <TextInput
            autoFocus
            onChangeText={onChangeDraft}
            onSubmitEditing={onSave}
            placeholder="Chat title"
            placeholderTextColor="#8F8A9E"
            returnKeyType="done"
            style={styles.renameChatInput}
            value={draft}
          />
          <View style={styles.renameChatActions}>
            <Pressable style={styles.renameChatCancelButton} onPress={onCancel}>
              <Text style={styles.renameChatCancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.renameChatSaveButton} onPress={onSave}>
              <Text style={styles.renameChatSaveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
  onScan: () => Promise<void>;
  pairing: boolean;
  pairingError: string;
  pairingMessage: string;
  pendingMachineName?: string;
  scanning: boolean;
  visible: boolean;
}) {
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

          <Pressable disabled={pairing || scanning} style={[styles.pcScanButton, pairing || scanning ? styles.pcControlDisabled : null]} onPress={onScan}>
            {scanning ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name="search-outline" color={colors.text} size={21} />}
            <Text style={styles.pcScanButtonText}>{scanning ? "Finding nearby PCs..." : candidates.length > 0 ? "Search again" : "Find nearby PCs"}</Text>
          </Pressable>

          <View style={styles.pcCandidateList}>
            {visibleCandidates.map((desktop) => {
              const disabled = pairing || scanning || desktop.status === "offline";

              return (
                <Pressable disabled={disabled} key={`${desktop.url}-${desktop.pairCode}`} style={[styles.pcCandidateRow, disabled ? styles.pcControlDisabled : null]} onPress={() => onConnectCandidate(desktop)}>
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
              );
            })}
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
              <Pressable disabled={pairing} style={[styles.pcCodeButton, pairing ? styles.pcControlDisabled : null]} onPress={onConnectManual}>
                {pairing ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name="link-outline" color={colors.text} size={20} />}
              </Pressable>
            </View>
          </View>

          {statusMessage ? <Text style={styles.pcSwitcherMessage}>{statusMessage}</Text> : null}
          {pairingError ? <Text style={styles.pcSwitcherError}>{pairingError}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

function TokenMembershipSheet({ onClose, onManage, plan, tokenBalance, tokensUsed, visible }: {
  onClose: () => void;
  onManage: () => void;
  plan: string;
  tokenBalance: number;
  tokensUsed: number;
  visible: boolean;
}) {
  const allowance = Math.max(tokenBalance + tokensUsed, plan === "free" ? 50 : tokenMembership.allowance);
  const progress = Math.min(1, tokenBalance / allowance);
  const availablePercent = Math.round((tokenBalance / allowance) * 100);
  const planLabel = formatPlanLabel(plan);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.tokenSheetOverlay}>
        <Pressable accessibilityLabel="Close token membership" style={styles.tokenSheetScrim} onPress={onClose} />
        <View style={styles.tokenSheet}>
          <View style={styles.tokenSheetHandle} />
          <View style={styles.tokenSheetHeader}>
            <View style={styles.tokenSheetHeaderIcon}>
              <Ionicons name="flash" color="#FFF200" size={24} />
            </View>
            <View style={styles.tokenSheetHeaderCopy}>
              <Text style={styles.tokenSheetKicker}>{planLabel} membership</Text>
              <Text numberOfLines={1} style={styles.tokenSheetTitle}>{tokenBalance.toLocaleString()} tokens available</Text>
            </View>
            <Pressable style={styles.tokenSheetClose} onPress={onClose}>
              <Ionicons name="close" color={colors.text} size={21} />
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
                  <Ionicons name="refresh-outline" color="#FFF200" size={15} />
                  <Text style={styles.tokenRenewalText}>{tokenMembership.renewal}</Text>
                </View>
              </View>
              <View style={styles.tokenTrack}>
                <LinearGradient
                  colors={["#FFF200", "#C6FF00", "#8B35FF"]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[styles.tokenTrackFill, { width: `${progress * 100}%` }]}
                />
              </View>
            </View>

            <Pressable style={({ pressed }) => [styles.tokenManageButton, pressed ? styles.tokenManageButtonPressed : null]} onPress={onManage}>
              <LinearGradient
                colors={["#5E28D9", "#8B35FF"]}
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

function formatPlanLabel(plan: string) {
  const normalized = plan.trim().toLowerCase();
  if (!normalized || normalized === "free") return "Free Plan";
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)} Plan`;
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
            <Image resizeMode="contain" source={dashboardHeroArt} style={styles.welcomeHeroImage as ImageStyle} />
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
  connected: boolean;
  desktopFolders: Project[];
  filteredProjects: Project[];
  onCreateProject: () => Promise<void>;
  onOpenProjectPreview: (projectId: string, projectName: string) => void;
  onScrollNeededChange: (needed: boolean) => void;
  onSearch: (value: string) => void;
  projectSearch: string;
  selectedProjectId: string;
}) {
  const { height, width } = useWindowDimensions();
  const projectLayout = useMemo(() => getProjectsLayout(width, height), [height, width]);
  const [archivedProjectIds, setArchivedProjectIds] = useState<Set<string>>(() => new Set());
  const [deletedProjectIds, setDeletedProjectIds] = useState<Set<string>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState<ProjectDisplay | null>(null);
  const initialFilterMode: typeof projectFilterModes[number] = props.connected ? "All" : "All";
  const [filterMode, setFilterMode] = useState<typeof projectFilterModes[number]>(initialFilterMode);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [openedProjectId, setOpenedProjectId] = useState<string | null>(null);
  const [renamedProjectNames, setRenamedProjectNames] = useState<Record<string, string>>({});
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  useEffect(() => {
    if (!props.connected && filterMode !== "All") {
      setFilterMode("All");
      setFilterMenuOpen(false);
    }
  }, [props.connected, filterMode]);

  const sourceFilteredProjects = useMemo(() => {
    if (!props.connected) return props.filteredProjects;
    if (filterMode === "PC") {
      return props.filteredProjects.filter((project) => (project.source ?? "pc") === "pc");
    }
    if (filterMode === "Mobile") {
      return props.filteredProjects.filter((project) => project.source === "mobile");
    }
    return props.filteredProjects;
  }, [props.connected, props.filteredProjects, filterMode]);

  const includedDesktopFolders = useMemo(() => {
    if (!props.connected || filterMode !== "All") return [];
    const knownPaths = new Set(props.filteredProjects.map((project) => project.path));
    return props.desktopFolders.filter((folder) => !knownPaths.has(folder.path));
  }, [props.connected, props.desktopFolders, props.filteredProjects, filterMode]);

  const combined = useMemo(() => [...sourceFilteredProjects, ...includedDesktopFolders], [includedDesktopFolders, sourceFilteredProjects]);

  const baseProjects = combined.map((project, index): ProjectDisplay => ({
      branch: index % 2 === 0 ? "main" : "develop",
      id: project.id,
      name: renamedProjectNames[project.id] ?? project.name,
      path: project.path,
      sourceProject: project,
      stack: project.stack,
      status: projectStatuses[index % projectStatuses.length],
      updated: `Updated ${project.updated}`
    }));
  const displayProjects = baseProjects
    .filter((project) => !deletedProjectIds.has(project.id))
    .map((project) => ({
      ...project,
      status: archivedProjectIds.has(project.id) ? "Archived" as const : project.status
    }));
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

  function createProject() {
    setFilterMenuOpen(false);
    setMenuProjectId(null);
    setRenamingProjectId(null);
    setDeletedProjectIds(new Set());
    void props.onCreateProject();
  }

  function openProject(project: ProjectDisplay) {
    setOpenedProjectId(project.id);
    setFilterMenuOpen(false);
    setMenuProjectId(null);
    setRenamingProjectId(null);
    const projectId = project.sourceProject?.id ?? project.id;
    props.onOpenProjectPreview(projectId, project.name);
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
      <ImageBackground source={projectsBackdrop} style={styles.projectsBackdrop} imageStyle={styles.projectsBackdropImage as ImageStyle}>
        <View style={styles.projectsBackdropShade} />
      </ImageBackground>

      <View style={styles.projectsHero}>
        <View style={styles.projectsHeroCopy}>
          <Text style={styles.projectsHeroSubtitle}>Manage and organize all your workspace projects.</Text>
          <Pressable style={({ pressed }) => [styles.projectsCreateButton, pressed ? styles.projectsCreateButtonPressed : null]} onPress={createProject}>
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
        <Image source={projectsFoldersHero} style={[styles.projectsFoldersHero as ImageStyle, projectLayout.heroImageStyle]} resizeMode="contain" />
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
        {props.connected ? (
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
        ) : null}
      </View>

      {props.connected ? (
        <Text style={styles.projectsFilterLabel}>
          Showing {filterMode === "All" ? "all" : filterMode === "PC" ? "PC" : "mobile"} projects
        </Text>
      ) : null}

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
  accountPlan: string;
  agentRequesting: boolean;
  bottomInset: number;
  chatMessages: ChatMessage[];
  creditsLow: boolean;
  creditPercentRemaining: number;
  onOpenApp: (app: GeneratedApp) => void;
  onOpenTokens: () => void;
  onStart: () => void;
  projectChatTitles: Record<string, string>;
  selectedChatModel: string;
  selectedChatId: string | null;
  selectedFileName: string;
  selectedModel: ModelKey;
  setSelectedChatId: (chatId: string | null) => void;
  setSelectedChatModel: (model: string) => void;
  setSelectedModel: (model: ModelKey) => void;
  setTaskText: (value: string) => void;
  taskText: string;
}) {
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [selectedChatModel, setSelectedChatModel] = useState<string>(() => getUnlockedInitialChatModel(props.selectedModel, props.accountPlan, props.selectedChatModel));
  const hasConversation = props.chatMessages.length > 0;
  const currentModel = chatModelOptions.find((model) => model.key === selectedChatModel) ?? chatModelOptions[0];
  const messageListRef = useRef<ScrollView | null>(null);
  const shouldFollowChatRef = useRef(true);
  const latestMessage = props.chatMessages[props.chatMessages.length - 1];
  const latestMessageKey = latestMessage ? `${latestMessage.id}:${latestMessage.text.length}` : "";

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => messageListRef.current?.scrollToEnd({ animated }));
    setTimeout(() => messageListRef.current?.scrollToEnd({ animated }), 60);
    setTimeout(() => messageListRef.current?.scrollToEnd({ animated }), 180);
  }, []);

  const followIfAtBottom = useCallback((animated = true) => {
    if (!shouldFollowChatRef.current) return;
    scrollToBottom(animated);
  }, [scrollToBottom]);

  const handleMessageScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    shouldFollowChatRef.current = distanceFromBottom < 72;
  }, []);

  useEffect(() => {
    const safeModel = getUnlockedInitialChatModel(props.selectedModel, props.accountPlan, props.selectedChatModel);
    setSelectedChatModel(safeModel);
    if (safeModel !== props.selectedChatModel) {
      props.setSelectedChatModel(safeModel);
    }
  }, [props.accountPlan, props.selectedChatModel, props.selectedModel, props.setSelectedChatModel]);

  useEffect(() => {
    if (!hasConversation) return;
    if (latestMessage?.role === "user") {
      shouldFollowChatRef.current = true;
      scrollToBottom(true);
      return;
    }
    followIfAtBottom(true);
  }, [hasConversation, latestMessage?.role, latestMessageKey, followIfAtBottom, scrollToBottom]);

  function selectModel(model: ChatModelOption) {
    if (isModelLockedForPlan(model, props.accountPlan)) return;
    setSelectedChatModel(model.key);
    props.setSelectedChatModel(model.key);
    if (model.modelKey) props.setSelectedModel(model.modelKey);
    setModelMenuOpen(false);
  }

  return (
    <View style={[styles.chatPage, styles.chatActivePage]}>
      <View style={styles.chatAssistantPanel}>
        {hasConversation ? (
          <ScrollView
            contentContainerStyle={styles.chatMessageListContent}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => followIfAtBottom(true)}
            onLayout={() => followIfAtBottom(false)}
            onScroll={handleMessageScroll}
            ref={messageListRef}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            style={styles.chatMessageList}
          >
            {props.chatMessages.map((message) => <MessageBubble key={message.id} message={message} onOpenApp={props.onOpenApp} />)}
          </ScrollView>
        ) : (
          <ChatEmptyState />
        )}

        <View style={[styles.chatComposerShell, { paddingBottom: Math.max(props.bottomInset, 8) }]}>
          {props.creditsLow ? (
            <LowCreditsWarning
              onOpenTokens={props.onOpenTokens}
              percentRemaining={props.creditPercentRemaining}
            />
          ) : null}
          {modelMenuOpen ? (
            <View style={styles.chatModelMenu}>
              {chatModelGroups.map((group) => (
                <View key={group.title || "auto"} style={styles.chatModelGroup}>
                  {group.title ? <Text style={styles.chatModelGroupTitle}>{group.title}</Text> : null}
                  {group.options.map((model) => (
                    <ModelMenuRow
                      key={model.key}
                      accountPlan={props.accountPlan}
                      model={model}
                      onSelect={selectModel}
                      selected={selectedChatModel === model.key}
                    />
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
                  {currentModel.badge ? <Text style={styles.chatModelButtonBadge}>New</Text> : null}
                  {isModelLockedForPlan(currentModel, props.accountPlan) ? <Ionicons name="lock-closed" color="#AAA6BC" size={12} /> : null}
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

function ModelMenuRow({
  accountPlan,
  model,
  onSelect,
  selected
}: {
  accountPlan: string;
  model: ChatModelOption;
  onSelect: (model: ChatModelOption) => void;
  selected: boolean;
}) {
  const locked = isModelLockedForPlan(model, accountPlan);

  return (
    <Pressable
      disabled={locked}
      onPress={() => onSelect(model)}
      style={[
        styles.chatModelRow,
        selected ? styles.chatModelRowActive : null,
        locked ? styles.chatModelRowLocked : null
      ]}
    >
      <ModelProviderIcon provider={model.provider} />
      <Text numberOfLines={1} style={styles.chatModelName}>{model.label}</Text>
      {model.badge ? <Text style={styles.chatModelBadge}>{model.badge}</Text> : null}
      {locked ? (
        <View style={styles.chatModelLockPill}>
          <Ionicons name="lock-closed" color="#C9C2D6" size={11} />
          <Text style={styles.chatModelLockText}>Pro</Text>
        </View>
      ) : null}
      {selected ? <Ionicons name="checkmark" color="#7CF1B3" size={18} /> : null}
    </Pressable>
  );
}

function getUnlockedInitialChatModel(selectedModel: ModelKey, accountPlan: string, preferredModel?: string) {
  const preferred = preferredModel ? chatModelOptions.find((model) => model.key === preferredModel) : null;
  if (preferred && !isModelLockedForPlan(preferred, accountPlan)) return preferred.key;

  const selected = chatModelOptions.find((model) => model.modelKey === selectedModel || model.key === selectedModel);
  if (selected && !isModelLockedForPlan(selected, accountPlan)) return selected.key;
  return "gpt-5.4-mini";
}

function isModelLockedForPlan(model: ChatModelOption, accountPlan: string) {
  return Boolean(model.locked && accountPlan.toLowerCase() === "free");
}

function LowCreditsWarning({ onOpenTokens, percentRemaining }: {
  onOpenTokens: () => void;
  percentRemaining: number;
}) {
  return (
    <View style={styles.lowCreditsCard}>
      <View style={styles.lowCreditsIcon}>
        <Ionicons name="flash" color="#FFF200" size={20} />
      </View>
      <View style={styles.lowCreditsCopy}>
        <Text style={styles.lowCreditsTitle}>Credits are running low</Text>
        <Text style={styles.lowCreditsText}>{Math.max(0, percentRemaining)}% remaining. Top up soon to keep AI chat flowing.</Text>
      </View>
      <Pressable style={styles.lowCreditsButton} onPress={onOpenTokens}>
        <Text style={styles.lowCreditsButtonText}>View</Text>
      </Pressable>
    </View>
  );
}

function ChatEmptyState() {
  return (
    <View style={styles.chatEmptyState}>
      <ChatWelcomeGlyph />
      <Text style={styles.chatWelcomeTitle}>How can I help you build today?</Text>
      <Text style={styles.chatWelcomeSubtitle}>Ask anything about your project, code, ideas, or problems.</Text>
      <View style={styles.chatSuggestionGrid}>
        {chatSuggestions.map((suggestion) => (
          <Pressable key={suggestion.title} style={styles.chatSuggestionCard}>
            <Ionicons name={suggestion.icon} color="#8B35FF" size={28} style={styles.chatSuggestionIconGlyph} />
            <Text numberOfLines={2} style={styles.chatSuggestionTitle}>{suggestion.title}</Text>
            <Text numberOfLines={3} style={styles.chatSuggestionDescription}>{suggestion.description}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ChatWelcomeGlyph() {
  return (
    <View pointerEvents="none" style={styles.chatWelcomeGlyph}>
      <Image resizeMode="contain" source={aiChatGlyph} style={styles.chatWelcomeGlyphImage as ImageStyle} />
    </View>
  );
}

function ModelProviderIcon({ compact, provider }: { compact?: boolean; provider: ChatModelProvider }) {
  const config = {
    auto: { color: "#EDE9FF", icon: "sparkles-outline" as const },
    claude: { color: "#D97757", icon: "sunny-outline" as const },
    openai: { color: "#10A37F", icon: "aperture-outline" as const },
    gemini: { color: "#8EA0FF", icon: "diamond-outline" as const }
  }[provider];
  const logoSource = provider === "openai" || provider === "gemini" ? providerLogoSources[provider] : null;

  return (
    <View style={[
      styles.chatProviderIcon,
      compact ? styles.chatProviderIconCompact : null
    ]}>
      {provider === "claude" ? (
        <ClaudeLogo compact={compact} />
      ) : logoSource ? (
        <Image
          resizeMode="contain"
          source={{ uri: logoSource }}
          style={[
            styles.chatProviderLogo as ImageStyle,
            compact ? styles.chatProviderLogoCompact as ImageStyle : null,
            provider === "openai" ? styles.chatProviderLogoOpenAi as ImageStyle : null
          ]}
        />
      ) : (
        <Ionicons name={config.icon} color={config.color} size={compact ? 14 : 18} />
      )}
    </View>
  );
}

function ClaudeLogo({ compact }: { compact?: boolean }) {
  const size = compact ? 10 : 13;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect width="100" height="100" rx="22" fill="#D97757" />
      <Path
        d="M50 45 38 14l4-5h7l11 31 4-27 6-4 7 5-5 29 20-22h7l4 6-3 8-23 24 26-5 6 4 1 7-6 5-28 5 27 12 4 6-3 7-8 2-28-15 22 24v8l-6 5-8-2-18-24 5 30-4 7-8 1-5-7-1-30-18 25-8 2-6-5 2-8 22-28-26 15-8-1-4-7 3-7 28-17-30-2-6-5 2-7 7-4 30 3-25-19-2-8 6-5h8l25 19Z"
        fill="#FFF7F0"
      />
    </Svg>
  );
}

function CommunityPage({
  authToken,
  currentUserName,
  openedPostId,
  onOpenApp,
  onSelectPost,
  selectedPost
}: {
  authToken: string;
  currentUserName: string;
  openedPostId: string | null;
  onOpenApp: (postId: string) => void;
  onSelectPost: (post: CommunityPost | null) => void;
  selectedPost: CommunityPost | null;
}) {
  const [activeFilter, setActiveFilter] = useState<CommunityFilter>("All");
  const [bookmarkedPostIds, setBookmarkedPostIds] = useState<string[]>([]);
  const [commentDraftsByPostId, setCommentDraftsByPostId] = useState<Record<string, string>>({});
  const [commentErrorsByPostId, setCommentErrorsByPostId] = useState<Record<string, string>>({});
  const [commentsByPostId, setCommentsByPostId] = useState<Record<string, CommunityComment[]>>(() => loadCommunityComments());
  const [commentPostingByPostId, setCommentPostingByPostId] = useState<Record<string, boolean>>({});
  const [likedPostIds, setLikedPostIds] = useState<string[]>([]);
  const [openedPostIds, setOpenedPostIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    saveCommunityComments(commentsByPostId);
  }, [commentsByPostId]);

  const filteredPosts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return communityPosts.filter((post) => {
      const matchesFilter = activeFilter === "All" || post.tag === activeFilter;
      const searchable = [post.title, post.description, post.user, ...post.tags].join(" ").toLowerCase();
      return matchesFilter && (!query || searchable.includes(query));
    });
  }, [activeFilter, searchQuery]);

  const toggleBookmark = useCallback((postId: string) => {
    setBookmarkedPostIds((current) => current.includes(postId) ? current.filter((id) => id !== postId) : [...current, postId]);
  }, []);

  const toggleLike = useCallback((postId: string) => {
    setLikedPostIds((current) => current.includes(postId) ? current.filter((id) => id !== postId) : [...current, postId]);
  }, []);

  const openApp = useCallback((postId: string) => {
    setOpenedPostIds((current) => current.includes(postId) ? current : [...current, postId]);
    onOpenApp(postId);
  }, [onOpenApp]);

  const addComment = useCallback(async (postId: string) => {
    const text = (commentDraftsByPostId[postId] ?? "").trim();
    if (!text) return;

    setCommentErrorsByPostId((current) => ({ ...current, [postId]: "" }));
    setCommentPostingByPostId((current) => ({ ...current, [postId]: true }));

    try {
      if (!authToken) {
        throw new Error("Log in to post a comment.");
      }

      await appApiRequest("/api/moderation", {
        method: "POST",
        body: JSON.stringify({
          surface: "community.comment",
          text
        })
      }, authToken);
    } catch (error) {
      setCommentErrorsByPostId((current) => ({
        ...current,
        [postId]: error instanceof Error ? error.message : "That comment could not be posted."
      }));
      setCommentPostingByPostId((current) => ({ ...current, [postId]: false }));
      return;
    }

    const displayName = currentUserName.trim() || "You";

    setCommentsByPostId((current) => ({
      ...current,
      [postId]: [
        ...(current[postId] ?? []),
        { id: `community-comment-${Date.now()}`, name: displayName, text, time: "Just now" }
      ]
    }));
    setCommentDraftsByPostId((current) => ({ ...current, [postId]: "" }));
    setCommentPostingByPostId((current) => ({ ...current, [postId]: false }));
  }, [authToken, commentDraftsByPostId, currentUserName]);

  if (selectedPost) {
    const addedComments = commentsByPostId[selectedPost.id] ?? [];
    const opened = openedPostIds.includes(selectedPost.id);

    if (openedPostId === selectedPost.id) {
      return <CommunityOpenedAppPage opened={opened} post={selectedPost} />;
    }

    return (
      <CommunityPostDetail
        addedComments={addedComments}
        bookmarked={bookmarkedPostIds.includes(selectedPost.id)}
        commentCount={selectedPost.comments + addedComments.length}
        commentDraft={commentDraftsByPostId[selectedPost.id] ?? ""}
        commentError={commentErrorsByPostId[selectedPost.id] ?? ""}
        commentPosting={Boolean(commentPostingByPostId[selectedPost.id])}
        liked={likedPostIds.includes(selectedPost.id)}
        opened={opened}
        post={selectedPost}
        onAddComment={() => addComment(selectedPost.id)}
        onCommentDraftChange={(text) => setCommentDraftsByPostId((current) => ({ ...current, [selectedPost.id]: text }))}
        onOpen={() => openApp(selectedPost.id)}
        onToggleBookmark={() => toggleBookmark(selectedPost.id)}
        onToggleLike={() => toggleLike(selectedPost.id)}
      />
    );
  }

  return (
    <View style={styles.communityScreen}>
      <View style={styles.communityHero}>
        <View style={styles.communityHeroCopy}>
          <Text style={styles.communityHeroSubtitle}>See what other builders are making.</Text>
        </View>
        <Image resizeMode="contain" source={communityHero} style={styles.communityHeroImage as ImageStyle} />
      </View>

      <View style={styles.communityTabs}>
        {(["All", "Recent", "Popular", "Featured"] as CommunityFilter[]).map((filter) => {
          const active = activeFilter === filter;
          return (
            <Pressable key={filter} onPress={() => setActiveFilter(filter)} style={[styles.communityTab, active ? styles.communityTabActive : null]}>
              <Text style={[styles.communityTabText, active ? styles.communityTabTextActive : null]}>{filter}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.communitySearchRow}>
        <View style={styles.communitySearchBar}>
          <Ionicons name="search-outline" color="#8E8AA3" size={22} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search projects, builders, tags..."
            placeholderTextColor="#8E8AA3"
            style={styles.communitySearchInput}
          />
        </View>
        <Pressable
          accessibilityLabel="Cycle community filter"
          style={styles.communityFilterButton}
          onPress={() => {
            const filters: CommunityFilter[] = ["All", "Recent", "Popular", "Featured"];
            const nextIndex = (filters.indexOf(activeFilter) + 1) % filters.length;
            setActiveFilter(filters[nextIndex]);
          }}
        >
          <Ionicons name="options-outline" color="#B4B1C9" size={22} />
        </Pressable>
      </View>

      <View style={styles.communityFeed}>
        {filteredPosts.length ? filteredPosts.map((post) => (
          <CommunityPostCard
            key={post.id}
            bookmarked={bookmarkedPostIds.includes(post.id)}
            liked={likedPostIds.includes(post.id)}
            post={post}
            commentCount={post.comments + (commentsByPostId[post.id]?.length ?? 0)}
            onOpen={() => onSelectPost(post)}
            onToggleBookmark={() => toggleBookmark(post.id)}
            onToggleLike={() => toggleLike(post.id)}
          />
        )) : (
          <View style={styles.communityEmptyState}>
            <Ionicons name="search-outline" color="#9D80FF" size={30} />
            <Text style={styles.communityEmptyTitle}>No apps found</Text>
            <Text style={styles.communityEmptyText}>Try a different search or filter.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function CommunityPostCard({ bookmarked, commentCount, liked, onOpen, onToggleBookmark, onToggleLike, post }: {
  bookmarked: boolean;
  commentCount: number;
  liked: boolean;
  onOpen: () => void;
  onToggleBookmark: () => void;
  onToggleLike: () => void;
  post: CommunityPost;
}) {
  const likes = post.likes + (liked ? 1 : 0);

  return (
    <Pressable style={({ pressed }) => [styles.communityPostCard, pressed ? styles.communityPostCardPressed : null]} onPress={onOpen}>
      <View style={styles.communityPostTop}>
        <CommunityAppLogo post={post} size={48} />
        <View style={styles.communityPostTitleBlock}>
          <Text numberOfLines={1} style={styles.communityPostTitle}>{post.title}</Text>
          <Text numberOfLines={2} style={styles.communityPostDescription}>{post.description}</Text>
        </View>
      </View>

      <View style={styles.communityMakerMiniRow}>
        <View style={[styles.communityMakerMiniAvatar, { backgroundColor: `${post.accent}26` }]}>
          <Text style={[styles.communityMakerMiniAvatarText, { color: post.accent }]}>{post.user.slice(0, 1)}</Text>
        </View>
        <Text numberOfLines={1} style={styles.communityMakerMiniName}>{post.user}</Text>
        <Text style={styles.communityMakerMiniDot}>-</Text>
        <Text style={styles.communityMakerMiniTime}>{post.time}</Text>
      </View>

      <View style={styles.communityPostBottom}>
        <View style={styles.communityPostStats}>
          <Pressable style={styles.communityPostStat} onPress={(event) => {
            event.stopPropagation();
            onToggleLike();
          }}>
            <Ionicons name={liked ? "heart" : "heart-outline"} color={liked ? "#FF6B9A" : "#B7B4C8"} size={17} />
            <Text style={[styles.communityPostStatText, liked ? styles.communityPostStatLiked : null]}>{likes}</Text>
          </Pressable>
          <View style={styles.communityPostStat}>
            <Ionicons name="chatbubble-outline" color="#B7B4C8" size={17} />
            <Text style={styles.communityPostStatText}>{commentCount}</Text>
          </View>
        </View>

        <Pressable style={styles.communityPostOpenButton} onPress={(event) => {
          event.stopPropagation();
          onOpen();
        }}>
          <Text style={styles.communityPostOpenText}>Open</Text>
        </Pressable>
        <Pressable style={styles.communityBookmark} onPress={(event) => {
          event.stopPropagation();
          onToggleBookmark();
        }}>
          <Ionicons name={bookmarked ? "bookmark" : "bookmark-outline"} color={bookmarked ? post.accent : "#D7D3EA"} size={17} />
        </Pressable>
      </View>
    </Pressable>
  );
}

function CommunityPostDetail({
  addedComments,
  bookmarked,
  commentCount,
  commentDraft,
  commentError,
  commentPosting,
  liked,
  onAddComment,
  onCommentDraftChange,
  onOpen,
  onToggleBookmark,
  onToggleLike,
  opened,
  post
}: {
  addedComments: CommunityComment[];
  bookmarked: boolean;
  commentCount: number;
  commentDraft: string;
  commentError: string;
  commentPosting: boolean;
  liked: boolean;
  onAddComment: () => void;
  onCommentDraftChange: (text: string) => void;
  onOpen: () => void;
  onToggleBookmark: () => void;
  onToggleLike: () => void;
  opened: boolean;
  post: CommunityPost;
}) {
  const [activeTab, setActiveTab] = useState<CommunityDetailTab>("about");
  const likes = post.likes + (liked ? 1 : 0);
  const comments = [...getCommunitySeedComments(post), ...addedComments];
  const canPostComment = commentDraft.trim().length > 0 && !commentPosting;

  return (
    <View style={styles.communityDetailScreen}>
      <View style={styles.communityDetailIdentity}>
        <View style={styles.communityDetailTitleBlock}>
          <Text style={styles.communityDetailKicker}>{post.tag} app</Text>
          <Text numberOfLines={2} style={styles.communityDetailTitle}>{formatCommunityTitle(post.title)}</Text>
          <Text style={styles.communityDetailDescription}>{post.description}</Text>
        </View>
        <CommunityAppLogo accent={communityDetailAccent} post={post} size={76} />
      </View>

      <View style={styles.communityDetailMakerLine}>
        <CommunityAuthorAvatar accent={communityDetailAccent} name={post.user} size={44} />
        <View style={styles.communityMakerCopy}>
          <Text style={styles.communityMakerName}>{post.user}</Text>
        </View>
      </View>

      <View style={styles.communityDetailActions}>
        <Pressable style={styles.communityPrimaryOpenButton} onPress={onOpen}>
          <LinearGradient
            colors={[communityDetailAccentDark, communityDetailAccent]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.communityPrimaryOpenGradient}
          >
            <Ionicons name={opened ? "checkmark-circle" : "open-outline"} color={colors.text} size={25} />
            <Text style={styles.communityPrimaryOpenText}>{opened ? "Opened" : "Open app"}</Text>
          </LinearGradient>
        </Pressable>
        <Pressable style={styles.communitySmallAction} onPress={onToggleBookmark}>
          <Ionicons name={bookmarked ? "bookmark" : "bookmark-outline"} color={colors.text} size={24} />
          <Text style={styles.communitySmallActionText}>{bookmarked ? "Saved" : "Save"}</Text>
        </Pressable>
        <Pressable style={styles.communityLikeButton} onPress={onToggleLike}>
          <Ionicons name={liked ? "heart" : "heart-outline"} color={liked ? "#FF6B9A" : colors.text} size={25} />
          <Text style={styles.communityDetailIconText}>{likes}</Text>
        </Pressable>
      </View>

      <View style={styles.communityDetailDivider} />

      <View style={styles.communityDetailTabs}>
        {(["about", "comments"] as CommunityDetailTab[]).map((tab) => {
          const active = activeTab === tab;
          return (
            <Pressable key={tab} style={[styles.communityDetailTab, active ? styles.communityDetailTabActive : null]} onPress={() => setActiveTab(tab)}>
              <Text style={[styles.communityDetailTabText, active ? styles.communityDetailTabTextActive : null]}>
                {tab === "about" ? "About" : `Comments ${commentCount}`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeTab === "about" ? (
        <View style={styles.communityTabPanel}>
          <View style={styles.communityDetailScreenshots}>
            <Text style={styles.communityDetailPanelTitle}>Screenshots</Text>
            <View style={styles.communityScreenshotGrid}>
              {post.screenshots.map((screenshot, index) => (
                <View key={screenshot} style={styles.communityScreenshotPreview}>
                  <CommunityPreview tone={post.accent} type={post.preview} />
                  <Text numberOfLines={1} style={styles.communityScreenshotLabel}>{screenshot}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.communityAboutBlock}>
            <Text style={styles.communityDetailPanelTitle}>About this app</Text>
            <Text style={styles.communityDetailPanelBody}>{post.about}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.communityCommentSection}>
          <View style={styles.communityCommentHeader}>
            <Text style={styles.communityDetailPanelTitle}>Comments</Text>
            <Text style={styles.communityCommentCount}>{commentCount}</Text>
          </View>
          <View style={styles.communityCommentComposer}>
            <TextInput
              multiline
              onChangeText={onCommentDraftChange}
              placeholder="Add a comment..."
              placeholderTextColor="#8F8A9E"
              style={styles.communityCommentInput}
              value={commentDraft}
            />
            <Pressable
              disabled={!canPostComment}
              onPress={onAddComment}
              style={[styles.communityCommentPostButton, !canPostComment ? styles.communityCommentPostButtonDisabled : null]}
            >
              {commentPosting ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name="send" color={colors.text} size={17} />}
              <Text style={styles.communityCommentPostText}>{commentPosting ? "Checking" : "Post"}</Text>
            </Pressable>
          </View>
          {commentError ? (
            <View style={styles.communityCommentError}>
              <Ionicons name="alert-circle-outline" color="#FFB4C1" size={18} />
              <Text style={styles.communityCommentErrorText}>{commentError}</Text>
            </View>
          ) : null}
          {comments.map((comment) => (
            <View key={comment.id} style={styles.communityCommentRow}>
              <CommunityAuthorAvatar accent={communityDetailAccent} name={comment.name} size={36} />
              <View style={styles.communityCommentCopy}>
                <View style={styles.communityCommentNameRow}>
                  <Text style={styles.communityCommentName}>{comment.name}</Text>
                  <Text style={styles.communityCommentTime}>{comment.time}</Text>
                </View>
                <Text style={styles.communityCommentText}>{comment.text}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function getCommunitySeedComments(post: CommunityPost): CommunityComment[] {
  const shared = [
    { name: "Iris", text: post.preview === "invoice" ? "The payment follow-up flow feels useful." : "This is clean and easy to understand.", time: "2d ago" },
    { name: "Sam", text: post.preview === "habit" ? "The weekly reflection screen is my favourite bit." : "The screenshots make the app feel ready to try.", time: "3d ago" },
    { name: "Ava", text: "The layout feels polished without being busy.", time: "4d ago" },
    { name: "Ben", text: "I like how quickly the core workflow makes sense.", time: "5d ago" },
    { name: "Nia", text: "This would be useful as a starter template.", time: "6d ago" },
    { name: "Theo", text: "The visual direction is strong and practical.", time: "1w ago" },
    { name: "Mila", text: "Nice balance between simple controls and useful detail.", time: "1w ago" },
    { name: "Owen", text: "The screenshots make me want to try the live version.", time: "1w ago" },
    { name: "Rae", text: "Clear idea, good execution, and easy to scan.", time: "2w ago" }
  ];

  return shared.slice(0, post.comments).map((comment, index) => ({
    id: `${post.id}-seed-${index}`,
    ...comment
  }));
}

function CommunityOpenedAppPage({ opened, post }: { opened: boolean; post: CommunityPost }) {
  return (
    <View style={styles.communityOpenedAppScreen}>
      <View style={styles.communityOpenedAppIntro}>
        <CommunityAppLogo accent={communityDetailAccent} post={post} size={64} />
        <View style={styles.communityOpenedAppCopy}>
          <Text style={styles.communityOpenedAppKicker}>{opened ? "Opened app" : "App preview"}</Text>
          <Text numberOfLines={2} style={styles.communityOpenedAppTitle}>{formatCommunityTitle(post.title)}</Text>
          <Text style={styles.communityOpenedAppSubtitle}>{post.description}</Text>
        </View>
      </View>
      <CommunityAppExperience post={post} />
    </View>
  );
}

function CommunityAppExperience({ post }: { post: CommunityPost }) {
  const [analyticsRange, setAnalyticsRange] = useState<"7d" | "30d">("7d");
  const [habitChecked, setHabitChecked] = useState(false);
  const [invoicePaid, setInvoicePaid] = useState(false);

  return (
    <View style={styles.communityAppExperience}>
      <View style={styles.communityAppExperienceHeader}>
        <View>
          <Text style={styles.communityAppExperienceKicker}>Live preview</Text>
          <Text style={styles.communityAppExperienceTitle}>{formatCommunityTitle(post.title)}</Text>
        </View>
        <View style={styles.communityAppLivePill}>
          <View style={styles.communityAppLiveDot} />
          <Text style={styles.communityAppLiveText}>Open</Text>
        </View>
      </View>

      {post.preview === "invoice" ? (
        <View style={styles.communityDemoPanel}>
          <View style={styles.communityDemoTopRow}>
            <View>
              <Text style={styles.communityDemoLabel}>Invoice total</Text>
              <Text style={styles.communityDemoValue}>$2,480</Text>
            </View>
            <Text style={[styles.communityDemoStatus, invoicePaid ? styles.communityDemoStatusDone : null]}>
              {invoicePaid ? "Paid" : "Due today"}
            </Text>
          </View>
          {["Design sprint", "Frontend build", "QA pass"].map((item, index) => (
            <View key={item} style={styles.communityDemoLineItem}>
              <Text style={styles.communityDemoLineText}>{item}</Text>
              <Text style={styles.communityDemoLineAmount}>${[900, 1280, 300][index].toLocaleString()}</Text>
            </View>
          ))}
          <Pressable style={styles.communityDemoAction} onPress={() => setInvoicePaid((paid) => !paid)}>
            <Ionicons name={invoicePaid ? "refresh-outline" : "checkmark-circle-outline"} color={colors.text} size={20} />
            <Text style={styles.communityDemoActionText}>{invoicePaid ? "Reset invoice" : "Mark as paid"}</Text>
          </Pressable>
        </View>
      ) : null}

      {post.preview === "habit" ? (
        <View style={styles.communityDemoPanel}>
          <View style={styles.communityHabitDemoTop}>
            <View style={[styles.communityHabitDemoRing, habitChecked ? styles.communityHabitDemoRingDone : null]}>
              <Text style={styles.communityHabitDemoScore}>{habitChecked ? "9/10" : "8/10"}</Text>
            </View>
            <View style={styles.communityHabitDemoCopy}>
              <Text style={styles.communityDemoLabel}>Today</Text>
              <Text style={styles.communityDemoValue}>{habitChecked ? "Completed" : "One habit left"}</Text>
            </View>
          </View>
          <View style={styles.communityHabitDemoGrid}>
            {Array.from({ length: 21 }).map((_, index) => (
              <View key={index} style={[styles.communityHabitDemoDot, index < (habitChecked ? 18 : 16) ? styles.communityHabitDemoDotDone : null]} />
            ))}
          </View>
          <Pressable style={styles.communityDemoAction} onPress={() => setHabitChecked((checked) => !checked)}>
            <Ionicons name={habitChecked ? "remove-circle-outline" : "add-circle-outline"} color={colors.text} size={20} />
            <Text style={styles.communityDemoActionText}>{habitChecked ? "Undo check-in" : "Check in"}</Text>
          </Pressable>
        </View>
      ) : null}

      {post.preview === "analytics" ? (
        <View style={styles.communityDemoPanel}>
          <View style={styles.communityAnalyticsDemoHeader}>
            <View>
              <Text style={styles.communityDemoLabel}>MRR</Text>
              <Text style={styles.communityDemoValue}>{analyticsRange === "7d" ? "$28.9K" : "$34.2K"}</Text>
            </View>
            <View style={styles.communityAnalyticsRange}>
              {(["7d", "30d"] as const).map((range) => (
                <Pressable key={range} style={[styles.communityAnalyticsRangeOption, analyticsRange === range ? styles.communityAnalyticsRangeOptionActive : null]} onPress={() => setAnalyticsRange(range)}>
                  <Text style={[styles.communityAnalyticsRangeText, analyticsRange === range ? styles.communityAnalyticsRangeTextActive : null]}>{range}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.communityAnalyticsBars}>
            {(analyticsRange === "7d" ? [46, 62, 54, 78, 66, 88, 94] : [36, 44, 58, 52, 68, 74, 82]).map((height, index) => (
              <View key={index} style={[styles.communityAnalyticsDemoBar, { height }]} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function formatCommunityTitle(title: string) {
  return title.replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/\bAi\b/g, "AI").replace(/\bSaas\b/g, "SaaS");
}

const COMMUNITY_COMMENTS_KEY = "vibyra.community.comments.v1";

function loadCommunityComments(): Record<string, CommunityComment[]> {
  try {
    if (typeof globalThis.localStorage === "undefined") return {};
    const raw = globalThis.localStorage.getItem(COMMUNITY_COMMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).map(([postId, value]) => [
      postId,
      normalizeCommunityComments(value)
    ]).filter(([, comments]) => comments.length > 0));
  } catch {
    return {};
  }
}

function saveCommunityComments(commentsByPostId: Record<string, CommunityComment[]>) {
  try {
    if (typeof globalThis.localStorage === "undefined") return;
    globalThis.localStorage.setItem(COMMUNITY_COMMENTS_KEY, JSON.stringify(commentsByPostId));
  } catch {
    // Community comments should remain usable even if local persistence is unavailable.
  }
}

function normalizeCommunityComments(value: unknown): CommunityComment[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): CommunityComment | null => {
      if (!item || typeof item !== "object") return null;
      const comment = item as Partial<CommunityComment>;
      const id = String(comment.id ?? "").trim();
      const text = String(comment.text ?? "").trim();
      if (!id || !text) return null;
      return {
        id,
        name: String(comment.name ?? "You").trim() || "You",
        text,
        time: String(comment.time ?? "Just now").trim() || "Just now"
      };
    })
    .filter((comment): comment is CommunityComment => Boolean(comment))
    .slice(-100);
}

function CommunityAuthorAvatar({ accent, name, size }: { accent: string; name: string; size: number }) {
  return (
    <LinearGradient
      colors={[`${accent}4D`, "rgba(126, 72, 255, 0.24)", "rgba(255, 255, 255, 0.07)"]}
      style={[
        styles.communityAuthorAvatar,
        { borderColor: `${accent}73`, borderRadius: size / 2, height: size, width: size }
      ]}
    >
      <Text style={[styles.communityAuthorAvatarText, { color: colors.text, fontSize: Math.max(11, size * 0.36) }]}>{name.slice(0, 1)}</Text>
    </LinearGradient>
  );
}

function CommunityAppLogo({ accent, post, size }: { accent?: string; post: CommunityPost; size: number }) {
  const logo = (post.logo ?? "default") as CommunityLogoKind;
  const radius = Math.round(size * 0.26);
  const tone = accent ?? post.accent;

  return (
    <LinearGradient
      colors={[`${tone}E6`, `${tone}78`, "rgba(255, 255, 255, 0.18)"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.communityGeneratedLogo, { borderRadius: radius, height: size, width: size }]}
    >
      <View style={[styles.communityGeneratedLogoInner, { borderRadius: Math.max(8, radius - 6) }]}>
        {logo === "invoice" ? (
          <>
            <View style={[styles.communityInvoicePage, { height: size * 0.54, width: size * 0.38 }]}>
              <View style={[styles.communityInvoiceLine, { width: "66%" }]} />
              <View style={[styles.communityInvoiceLine, { opacity: 0.62, width: "86%" }]} />
              <View style={[styles.communityInvoiceLine, { opacity: 0.42, width: "54%" }]} />
            </View>
            <View style={[styles.communityInvoiceCoin, { height: size * 0.2, right: size * 0.18, top: size * 0.18, width: size * 0.2 }]} />
          </>
        ) : null}

        {logo === "habit" ? (
          <>
            <View style={[styles.communityHabitLogoRing, { borderColor: colors.text, height: size * 0.5, width: size * 0.5 }]}>
              <View style={[styles.communityHabitLogoCore, { backgroundColor: tone }]} />
            </View>
            <View style={styles.communityHabitLogoDots}>
              {Array.from({ length: 5 }).map((_, index) => <View key={index} style={[styles.communityHabitLogoDot, index < 3 ? { backgroundColor: colors.text } : null]} />)}
            </View>
          </>
        ) : null}

        {logo === "analytics" ? (
          <View style={styles.communityAnalyticsLogoBars}>
            {[0.36, 0.64, 0.48, 0.78].map((height, index) => (
              <View key={index} style={[styles.communityAnalyticsLogoBar, { backgroundColor: index === 3 ? colors.text : "rgba(255, 255, 255, 0.72)", height: size * height }]} />
            ))}
          </View>
        ) : null}

        {logo === "default" ? (
          <>
            <View style={[styles.communityDefaultLogoOrb, { backgroundColor: colors.text, height: size * 0.24, width: size * 0.24 }]} />
            <View style={[styles.communityDefaultLogoBlade, { backgroundColor: `${tone}CC`, height: size * 0.52, width: size * 0.18 }]} />
            <View style={[styles.communityDefaultLogoBlade, styles.communityDefaultLogoBladeAlt, { height: size * 0.42, width: size * 0.15 }]} />
          </>
        ) : null}
      </View>
    </LinearGradient>
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
  accountPlan: string;
  creditsBalance: number;
  email: string;
  machineName: string;
  name: string;
  onTabChange: (tab: SettingsTab) => void;
  projectCount: number;
  selectedModel: string;
}) {
  const [selectedRow, setSelectedRow] = useState(getProfileRowForTab(props.activeTab));
  const profileEmail = props.email === "you@vibyra.app" || !props.email ? "you@vibyra.app" : props.email;
  const profileName = props.name.trim() || "Vibyra User";
  const profileInitial = profileName.charAt(0).toUpperCase();
  const planLabel = formatPlanLabel(props.accountPlan);

  useEffect(() => {
    setSelectedRow(getProfileRowForTab(props.activeTab));
  }, [props.activeTab]);

  const selectProfileRow = useCallback((label: string) => {
    setSelectedRow(label);
    const tab = getProfileTabForRow(label);
    if (tab) props.onTabChange(tab);
  }, [props]);

  return (
    <View style={styles.profileScreen}>
      <View style={styles.profileHeroCard}>
        <View style={styles.profileHeroTop}>
          <View style={styles.profileAvatarWrap}>
            <View style={styles.profileAvatarLarge}>
              <Text style={styles.profileAvatarLargeText}>{profileInitial}</Text>
            </View>
            <Pressable style={styles.profileAvatarEditButton}>
              <Ionicons name="pencil-outline" color="#E8E2F7" size={18} />
            </Pressable>
          </View>

          <View style={styles.profileSummaryCopy}>
            <Text style={styles.profileSummaryName}>{profileName}</Text>
            <Text style={styles.profileSummaryEmail}>{profileEmail}</Text>
            <View style={styles.profilePlanBadge}>
              <Ionicons name="diamond" color="#C259FF" size={16} />
              <Text style={styles.profilePlanBadgeText}>{planLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.profileDivider} />

        <View style={styles.profileUsageStrip}>
          <View style={styles.profileUsageItem}>
            <View style={styles.profileUsageIcon}>
              <Ionicons name="flash" color="#C259FF" size={29} />
            </View>
            <View>
              <Text style={styles.profileUsageValue}>{props.creditsBalance.toLocaleString()}</Text>
              <Text style={styles.profileUsageLabel}>tokens remaining</Text>
            </View>
          </View>
          <View style={styles.profileUsageDivider} />
          <View style={styles.profileUsageItem}>
            <View style={styles.profileUsageIcon}>
              <Ionicons name="calendar-clear-outline" color="#B8B3CB" size={25} />
            </View>
            <View>
              <Text style={styles.profileRenewMeta}>{props.accountPlan === "free" ? "Current plan" : "Renews on"}</Text>
              <Text style={styles.profileRenewDate}>{props.accountPlan === "free" ? "Free trial" : "May 24, 2025"}</Text>
            </View>
          </View>
        </View>
      </View>

      <ProfileSettingsGroup
        activeLabel={selectedRow}
        onSelect={selectProfileRow}
        title="ACCOUNT"
        rows={[
          { icon: "person-outline", label: "Profile information" },
          { icon: "card-outline", label: "Billing & subscription" },
          { icon: "time-outline", label: "Usage & history" },
          { icon: "gift-outline", label: "Refer & earn" }
        ]}
      />

      <ProfileSettingsGroup
        activeLabel={selectedRow}
        onSelect={selectProfileRow}
        title="PREFERENCES"
        rows={[
          { icon: "notifications-outline", label: "Notifications" },
          { icon: "color-palette-outline", label: "Appearance" },
          { icon: "shield-outline", label: "Privacy & security" },
          { icon: "globe-outline", label: "Language", value: "English" }
        ]}
      />

      <ProfileSettingsGroup
        activeLabel={selectedRow}
        onSelect={selectProfileRow}
        title="SUPPORT"
        rows={[
          { icon: "help-circle-outline", label: "Help center" },
          { icon: "chatbubble-outline", label: "Contact support" },
          { icon: "document-text-outline", label: "Terms of service" },
          { danger: true, icon: "log-out-outline", label: "Log out" }
        ]}
      />
    </View>
  );
}

function getProfileRowForTab(tab: SettingsTab) {
  if (tab === "billing") return "Billing & subscription";
  if (tab === "preferences") return "Appearance";
  if (tab === "security") return "Privacy & security";
  return "Profile information";
}

function getProfileTabForRow(label: string): SettingsTab | null {
  if (label === "Profile information") return "profile";
  if (label === "Billing & subscription" || label === "Usage & history") return "billing";
  if (label === "Notifications" || label === "Appearance" || label === "Language") return "preferences";
  if (label === "Privacy & security") return "security";
  return null;
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

function ProfileSettingsGroup({ activeLabel, onSelect, rows, title }: {
  activeLabel: string;
  onSelect: (label: string) => void;
  rows: Array<{ danger?: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; value?: string }>;
  title: string;
}) {
  return (
    <View style={styles.profileSection}>
      <Text style={styles.profileGroupTitle}>{title}</Text>
      <View style={styles.profileGroup}>
        {rows.map((row, index) => {
          const active = activeLabel === row.label;
          return (
            <Pressable
              key={row.label}
              onPress={() => onSelect(row.label)}
              style={({ pressed }) => [
                styles.profileRow,
                index === rows.length - 1 ? styles.profileRowLast : null,
                active ? styles.profileRowActive : null,
                pressed ? styles.profileRowPressed : null
              ]}
            >
              <View style={[styles.profileRowIcon, row.danger ? styles.profileRowIconDanger : null]}>
                <Ionicons name={row.icon} color={row.danger ? "#FF465C" : "#B953FF"} size={23} />
              </View>
              <Text numberOfLines={1} style={[styles.profileRowLabel, row.danger ? styles.profileRowLabelDanger : null]}>{row.label}</Text>
              {row.value ? <Text numberOfLines={1} style={styles.profileRowValue}>{row.value}</Text> : null}
              <Ionicons name="chevron-forward" color="#AAA6BA" size={23} />
            </Pressable>
          );
        })}
      </View>
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

function FolderConfirmModal({ confirm, onAccept, onCancel, onSkip }: {
  confirm: { query: string; matches: Project[] } | null;
  onAccept: (folder: Project) => void | Promise<void>;
  onCancel: () => void;
  onSkip: () => void | Promise<void>;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={confirm !== null}>
      <View style={styles.projectDeleteOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.projectDeleteDialog}>
          <View style={styles.projectDeleteIcon}>
            <Ionicons name="folder-open-outline" color="#A88BFF" size={24} />
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
                <Ionicons name="folder-outline" color="#E8E1FF" size={18} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.projectMenuItemText}>{folder.name}</Text>
                  <Text numberOfLines={1} style={[styles.projectMenuItemText, { color: "#9892B5", fontSize: 11, marginTop: 2 }]}>{folder.path}</Text>
                </View>
                <Ionicons name="chevron-forward" color="#9892B5" size={16} />
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
      <Image resizeMode="contain" source={chatBuildAiHero} style={styles.chatLandingArtImage as ImageStyle} />
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

function MessageBubble({ message, onOpenApp }: { message: ChatMessage; onOpenApp?: (app: GeneratedApp) => void }) {
  const user = message.role === "user";
  const isThinking = !user && message.text === "Working on it...";
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 320, useNativeDriver: true })
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View style={[styles.messageRow, user ? styles.messageRowUser : styles.messageRowAssistant, { opacity, transform: [{ translateY }] }]}>
      <View style={[styles.messageAvatar, user ? styles.messageAvatarUser : styles.messageAvatarAssistant]}>
        {user ? (
          <Ionicons name="person" color="#FFFFFF" size={14} />
        ) : (
          <Image resizeMode="contain" source={vibyraLogo} style={styles.messageAvatarLogo as ImageStyle} />
        )}
      </View>
      <View style={styles.messageContent}>
        <Text style={styles.messageAuthor}>{user ? "You" : "Vibyra"}</Text>
        {message.file ? <Text numberOfLines={1} style={styles.messageFile}>{message.file}</Text> : null}
        {isThinking ? (
          <TypingIndicator />
        ) : (
          <RichMessageText text={message.text} />
        )}
        {message.app && onOpenApp ? <AppPreviewCard app={message.app} onOpen={onOpenApp} /> : null}
      </View>
    </Animated.View>
  );
}

function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sequence = (value: Animated.Value, delay: number) => Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 360, delay, useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: 360, useNativeDriver: true })
      ])
    );
    const animation = Animated.parallel([
      sequence(dot1, 0),
      sequence(dot2, 140),
      sequence(dot3, 280)
    ]);
    animation.start();
    return () => animation.stop();
  }, [dot1, dot2, dot3]);

  const dotStyle = (value: Animated.Value) => ({
    opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }]
  });

  return (
    <View style={styles.typingIndicator}>
      <Animated.View style={[styles.typingDot, dotStyle(dot1)]} />
      <Animated.View style={[styles.typingDot, dotStyle(dot2)]} />
      <Animated.View style={[styles.typingDot, dotStyle(dot3)]} />
    </View>
  );
}

function AppPreviewCard({ app, onOpen }: { app: GeneratedApp; onOpen: (app: GeneratedApp) => void }) {
  return (
    <Pressable onPress={() => onOpen(app)} style={styles.appPreviewCard}>
      <LinearGradient
        colors={["#8E3CFF", "#5D24D8"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.appPreviewIcon}
      >
        <Ionicons name="play" color="#FFFFFF" size={20} />
      </LinearGradient>
      <View style={styles.appPreviewBody}>
        <Text style={styles.appPreviewLabel}>Runnable preview</Text>
        <Text numberOfLines={1} style={styles.appPreviewTitle}>{app.title}</Text>
        <Text numberOfLines={1} style={styles.appPreviewHint}>Tap to open the app inside Vibyra</Text>
      </View>
      <View style={styles.appPreviewArrow}>
        <Ionicons name="chevron-forward" color="#C9C2D6" size={18} />
      </View>
    </Pressable>
  );
}

function AppPreviewModal({ app, onClose }: { app: GeneratedApp | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (app) setReloadKey(0);
  }, [app?.id]);

  if (!app) return null;

  return (
    <Modal animationType="slide" presentationStyle="fullScreen" visible onRequestClose={onClose}>
      <View style={[styles.appModalScreen, { paddingTop: insets.top }]}>
        <View style={styles.appModalHeader}>
          <Pressable onPress={onClose} style={styles.appModalIconButton}>
            <Ionicons name="close" color="#FFFFFF" size={22} />
          </Pressable>
          <View style={styles.appModalTitleStack}>
            <Text style={styles.appModalLabel}>Vibyra preview</Text>
            <Text numberOfLines={1} style={styles.appModalTitle}>{app.title}</Text>
          </View>
          <Pressable onPress={() => setReloadKey((k) => k + 1)} style={styles.appModalIconButton}>
            <Ionicons name="refresh" color="#FFFFFF" size={20} />
          </Pressable>
        </View>
        <View style={styles.appModalWebContainer}>
          <AppWebView html={app.html} reloadKey={reloadKey} style={styles.appModalWebView} />
        </View>
      </View>
    </Modal>
  );
}

type MessageBlock =
  | { kind: "code"; language: string; code: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "numbered"; marker: string; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "spacer" };

function parseMessageBlocks(input: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  const fenceRegex = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(input)) !== null) {
    if (match.index > cursor) {
      pushTextBlocks(blocks, input.slice(cursor, match.index));
    }
    blocks.push({ kind: "code", language: match[1].trim(), code: match[2].replace(/\n$/, "") });
    cursor = match.index + match[0].length;
  }
  if (cursor < input.length) {
    pushTextBlocks(blocks, input.slice(cursor));
  }
  return blocks;
}

function pushTextBlocks(blocks: MessageBlock[], text: string) {
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (blocks.length && blocks[blocks.length - 1].kind !== "spacer") {
        blocks.push({ kind: "spacer" });
      }
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      blocks.push({ kind: "bullet", text: bullet[1] });
      continue;
    }
    const numbered = /^(\d+)[.)]\s+(.+)$/.exec(trimmed);
    if (numbered) {
      blocks.push({ kind: "numbered", marker: `${numbered[1]}.`, text: numbered[2] });
      continue;
    }
    blocks.push({ kind: "paragraph", text: trimmed });
  }
}

function renderInline(text: string, keyPrefix: string) {
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = text.split(tokenRegex).filter((part) => part.length > 0);
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <Text key={key} style={styles.messageBold}>{part.slice(2, -2)}</Text>;
    }
    if (/^`[^`]+`$/.test(part)) {
      return <Text key={key} style={styles.messageInlineCode}>{part.slice(1, -1)}</Text>;
    }
    return <Text key={key}>{part}</Text>;
  });
}

function RichMessageText({ text }: { text: string }) {
  const blocks = useMemo(() => parseMessageBlocks(text), [text]);

  return (
    <View style={styles.messageBody}>
      {blocks.map((block, index) => {
        const key = `block-${index}`;
        if (block.kind === "code") {
          return (
            <View key={key} style={styles.messageCodeBlock}>
              {block.language ? (
                <View style={styles.messageCodeBlockHeader}>
                  <Text style={styles.messageCodeBlockLang}>{block.language.toLowerCase()}</Text>
                </View>
              ) : null}
              <Text style={styles.messageCodeBlockText}>{block.code}</Text>
            </View>
          );
        }
        if (block.kind === "heading") {
          const headingStyle = block.level === 1
            ? styles.messageHeading1
            : block.level === 2
              ? styles.messageHeading2
              : styles.messageHeading3;
          return <Text key={key} style={headingStyle}>{renderInline(block.text, key)}</Text>;
        }
        if (block.kind === "bullet") {
          return (
            <View key={key} style={styles.messageListRow}>
              <Text style={styles.messageBulletDot}>•</Text>
              <Text style={[styles.messageText, styles.messageListText]}>{renderInline(block.text, key)}</Text>
            </View>
          );
        }
        if (block.kind === "numbered") {
          return (
            <View key={key} style={styles.messageListRow}>
              <Text style={styles.messageNumberedMarker}>{block.marker}</Text>
              <Text style={[styles.messageText, styles.messageListText]}>{renderInline(block.text, key)}</Text>
            </View>
          );
        }
        if (block.kind === "spacer") {
          return <View key={key} style={styles.messageSpacer} />;
        }
        return <Text key={key} style={styles.messageText}>{renderInline(block.text, key)}</Text>;
      })}
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
    gap: 0,
    justifyContent: "flex-end",
    minHeight: 0,
    paddingBottom: Platform.OS === "ios" ? 8 : 2
  },
  chatComposer: {
    backgroundColor: "rgba(17, 19, 28, 0.96)",
    borderColor: "rgba(255, 255, 255, 0.13)",
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 116,
    paddingBottom: 14,
    paddingHorizontal: 14,
    paddingTop: 14,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 18
  },
  chatComposerBottom: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18
  },
  chatComposerInput: {
    color: "#F3F1FA",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 22,
    maxHeight: 70,
    minHeight: 28,
    padding: 0,
    textAlignVertical: "top"
  },
  chatComposerTool: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.055)",
    borderColor: "rgba(126, 124, 155, 0.22)",
    borderRadius: 11,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  chatComposerTools: {
    alignItems: "center",
    flexDirection: "row",
    flex: 1,
    gap: 8,
    minWidth: 0
  },
  chatComposerShell: {
    paddingTop: 10,
    position: "relative",
    zIndex: 10
  },
  lowCreditsButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 242, 0, 0.14)",
    borderColor: "rgba(255, 242, 0, 0.34)",
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 12
  },
  lowCreditsButtonText: {
    color: "#FFF200",
    fontSize: 12,
    fontWeight: "900"
  },
  lowCreditsCard: {
    alignItems: "center",
    backgroundColor: "rgba(13, 15, 25, 0.94)",
    borderColor: "rgba(255, 242, 0, 0.22)",
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    marginBottom: 10,
    padding: 12,
    shadowColor: "#FFF200",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 18
  },
  lowCreditsCopy: {
    flex: 1,
    minWidth: 0
  },
  lowCreditsIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255, 242, 0, 0.1)",
    borderColor: "rgba(255, 242, 0, 0.26)",
    borderRadius: 11,
    borderWidth: 1,
    height: 39,
    justifyContent: "center",
    width: 39
  },
  lowCreditsText: {
    color: "#C9C3D5",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: 2
  },
  lowCreditsTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18
  },
  chatModelButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.055)",
    borderColor: "rgba(126, 124, 155, 0.22)",
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    height: 38,
    maxWidth: 206,
    minWidth: 0,
    paddingHorizontal: 12
  },
  chatModelButtonText: {
    color: "#DAD6E7",
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "800"
  },
  chatModelButtonBadge: {
    backgroundColor: "rgba(124, 241, 179, 0.11)",
    borderColor: "rgba(124, 241, 179, 0.28)",
    borderRadius: 999,
    borderWidth: 1,
    color: "#7CF1B3",
    fontSize: 9,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 2,
    textTransform: "uppercase"
  },
  chatModelBadge: {
    backgroundColor: "rgba(124, 241, 179, 0.1)",
    borderColor: "rgba(124, 241, 179, 0.24)",
    borderRadius: 999,
    borderWidth: 1,
    color: "#7CF1B3",
    fontSize: 9,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 3,
    textTransform: "uppercase"
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
    bottom: 148,
    gap: 4,
    left: 0,
    padding: 6,
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.34,
    shadowRadius: 24,
    width: 304,
    zIndex: 20
  },
  chatModelLockPill: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.055)",
    borderColor: "rgba(201, 194, 214, 0.18)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    minHeight: 22,
    paddingHorizontal: 7
  },
  chatModelLockText: {
    color: "#C9C2D6",
    fontSize: 10,
    fontWeight: "900"
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
    minHeight: 36,
    paddingHorizontal: 7
  },
  chatModelRowActive: {
    backgroundColor: "rgba(124, 241, 179, 0.08)"
  },
  chatModelRowLocked: {
    opacity: 0.64
  },
  chatActiveContent: {
    paddingBottom: Platform.OS === "ios" ? 38 : 36,
    paddingHorizontal: 14,
    paddingTop: 0
  },
  chatActiveHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    minHeight: 64,
    paddingHorizontal: 3
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
    backgroundColor: "#080A12",
    gap: 0,
    overflow: "hidden"
  },
  chatActiveTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 24
  },
  chatBackButton: {
    alignItems: "center",
    backgroundColor: "rgba(93, 40, 161, 0.12)",
    borderColor: "rgba(137, 72, 255, 0.22)",
    borderRadius: 14,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  chatEditButton: {
    alignItems: "center",
    borderRadius: 999,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  chatFavoriteButton: {
    alignItems: "center",
    borderRadius: 999,
    height: 34,
    justifyContent: "center",
    marginLeft: 2,
    width: 34
  },
  chatEmptySpace: {
    flex: 1,
    minHeight: 0
  },
  chatEmptyState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 0,
    paddingBottom: 52,
    paddingTop: 24
  },
  chatBackgroundImage: {
    ...StyleSheet.absoluteFillObject,
    height: "100%",
    opacity: 0.78,
    width: "100%"
  },
  chatContent: {
    backgroundColor: "#080A12",
    paddingBottom: Platform.OS === "ios" ? 38 : 36,
    paddingHorizontal: 14,
    paddingTop: 0
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
    minHeight: 0,
    width: "100%"
  },
  chatPageHost: {
    backgroundColor: "#080A12",
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 14,
    paddingTop: 0
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
    borderRadius: 13,
    overflow: "hidden"
  },
  chatSendGradient: {
    alignItems: "center",
    height: 38,
    justifyContent: "center",
    width: 38
  },
  chatSuggestionCard: {
    alignItems: "flex-start",
    backgroundColor: "rgba(16, 18, 30, 0.74)",
    borderColor: "rgba(126, 124, 155, 0.28)",
    borderRadius: 11,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    gap: 6,
    minHeight: 124,
    justifyContent: "flex-start",
    minWidth: 0,
    overflow: "hidden",
    padding: 12
  },
  chatSuggestionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 19,
    paddingHorizontal: 10,
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
  chatSuggestionDescription: {
    color: "#BBB6C9",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: 1,
    width: "100%"
  },
  chatSuggestionIconGlyph: {
    marginBottom: 2
  },
  chatSuggestionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
    width: "100%"
  },
  chatMessageList: {
    flex: 1,
    minHeight: 0
  },
  chatMessageListContent: {
    flexGrow: 1,
    gap: 4,
    paddingBottom: 14,
    paddingTop: 14
  },
  chatWelcomeBlock: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 0
  },
  chatWelcomeGlyph: {
    alignItems: "center",
    height: 136,
    justifyContent: "center",
    marginBottom: 18,
    marginTop: 8,
    width: 166
  },
  chatWelcomeGlyphImage: {
    height: 166,
    width: 166
  },
  chatWelcomeSubtitle: {
    color: "#C1BCCE",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 9,
    maxWidth: 340,
    textAlign: "center"
  },
  chatWelcomeTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 25,
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
  communityAboutBlock: {
    gap: 9,
    paddingTop: 2
  },
  communityGeneratedLogo: {
    alignItems: "center",
    borderColor: "rgba(170, 83, 255, 0.34)",
    borderWidth: 1,
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#7E48FF",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16
  },
  communityGeneratedLogoInner: {
    alignItems: "center",
    backgroundColor: "rgba(22, 11, 43, 0.36)",
    height: "82%",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    width: "82%"
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
  communityAnalyticsLogoBar: {
    borderRadius: 999,
    width: 5
  },
  communityAnalyticsLogoBars: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 4,
    height: "78%"
  },
  communityAuthorAvatar: {
    alignItems: "center",
    borderWidth: 1,
    justifyContent: "center",
    overflow: "hidden"
  },
  communityAuthorAvatarText: {
    fontWeight: "900"
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
  communityAppIcon: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
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
  communityAvatarLarge: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    height: 50,
    justifyContent: "center",
    width: 50
  },
  communityAvatarLargeText: {
    fontSize: 22,
    fontWeight: "900"
  },
  communityAnalyticsBars: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 8,
    height: 112
  },
  communityAnalyticsDemoBar: {
    backgroundColor: communityDetailAccent,
    borderRadius: 999,
    flex: 1,
    shadowColor: communityDetailAccent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 8
  },
  communityAnalyticsDemoHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  communityAnalyticsRange: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.09)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    padding: 4
  },
  communityAnalyticsRangeOption: {
    alignItems: "center",
    borderRadius: 7,
    minHeight: 29,
    minWidth: 42,
    justifyContent: "center"
  },
  communityAnalyticsRangeOptionActive: {
    backgroundColor: "rgba(139, 53, 255, 0.44)"
  },
  communityAnalyticsRangeText: {
    color: "#AFA9BB",
    fontSize: 12,
    fontWeight: "900"
  },
  communityAnalyticsRangeTextActive: {
    color: colors.text
  },
  communityAppExperience: {
    backgroundColor: "rgba(8, 11, 22, 0.9)",
    borderColor: "rgba(139, 53, 255, 0.34)",
    borderRadius: 16,
    borderWidth: 1,
    gap: 13,
    padding: 14,
    shadowColor: communityDetailAccent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 18
  },
  communityAppExperienceHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  communityAppExperienceKicker: {
    color: "#BFAEFF",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  communityAppExperienceTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22,
    marginTop: 3
  },
  communityOpenedAppCopy: {
    flex: 1,
    minWidth: 0
  },
  communityOpenedAppIntro: {
    alignItems: "center",
    backgroundColor: "rgba(8, 11, 22, 0.78)",
    borderColor: "rgba(139, 53, 255, 0.22)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    padding: 14
  },
  communityOpenedAppKicker: {
    color: "#BFAEFF",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  communityOpenedAppScreen: {
    flexGrow: 1,
    gap: 14,
    paddingBottom: 18
  },
  communityOpenedAppSubtitle: {
    color: "#BDB8C7",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 5
  },
  communityOpenedAppTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 25,
    marginTop: 3
  },
  communityAppLiveDot: {
    backgroundColor: "#7CF1B3",
    borderRadius: 999,
    height: 7,
    width: 7
  },
  communityAppLivePill: {
    alignItems: "center",
    backgroundColor: "rgba(124, 241, 179, 0.1)",
    borderColor: "rgba(124, 241, 179, 0.24)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 28,
    paddingHorizontal: 10
  },
  communityAppLiveText: {
    color: "#C9F8DD",
    fontSize: 11,
    fontWeight: "900"
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
  communityInvoiceCoin: {
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderRadius: 999,
    position: "absolute"
  },
  communityInvoiceLine: {
    backgroundColor: "rgba(255, 255, 255, 0.74)",
    borderRadius: 999,
    height: 4,
    marginTop: 5
  },
  communityInvoicePage: {
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    borderColor: "rgba(255, 255, 255, 0.34)",
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 6
  },
  communityCommentCopy: {
    flex: 1,
    minWidth: 0
  },
  communityCommentCount: {
    color: "#B7B1C6",
    fontSize: 14,
    fontWeight: "900"
  },
  communityCommentHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  communityCommentComposer: {
    alignItems: "flex-end",
    backgroundColor: "rgba(10, 13, 24, 0.84)",
    borderColor: "rgba(139, 53, 255, 0.28)",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 8
  },
  communityCommentError: {
    alignItems: "flex-start",
    backgroundColor: "rgba(255, 107, 154, 0.1)",
    borderColor: "rgba(255, 157, 174, 0.26)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 10
  },
  communityCommentErrorText: {
    color: "#FFB4C1",
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17
  },
  communityCommentInput: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
    maxHeight: 86,
    minHeight: 39,
    paddingHorizontal: 6,
    paddingTop: 9
  },
  communityCommentName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  communityCommentNameRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  communityCommentPostButton: {
    alignItems: "center",
    backgroundColor: communityDetailAccent,
    borderRadius: 10,
    flexDirection: "row",
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 12
  },
  communityCommentPostButtonDisabled: {
    opacity: 0.42
  },
  communityCommentPostText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  communityCommentRow: {
    alignItems: "flex-start",
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingBottom: 12
  },
  communityCommentSection: {
    gap: 12,
    paddingTop: 2
  },
  communityCommentText: {
    color: "#BDB7CA",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 3
  },
  communityCommentTime: {
    color: "#B8B2C4",
    fontSize: 13,
    fontWeight: "700"
  },
  communityDefaultLogoBlade: {
    borderRadius: 999,
    opacity: 0.82,
    position: "absolute",
    transform: [{ rotate: "34deg" }]
  },
  communityDefaultLogoBladeAlt: {
    backgroundColor: "rgba(255, 255, 255, 0.68)",
    opacity: 0.72,
    transform: [{ rotate: "-42deg" }]
  },
  communityDefaultLogoOrb: {
    borderRadius: 999,
    position: "absolute",
    right: 10,
    top: 10
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
  communityDetailActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7
  },
  communityDetailBack: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    marginLeft: -10,
    width: 44
  },
  communityDetailDescription: {
    color: "#B9B4C6",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 21,
    marginTop: 8
  },
  communityDetailHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 42
  },
  communityDetailHeaderCopy: {
    flex: 1,
    minWidth: 0
  },
  communityDetailHero: {
    alignItems: "center",
    backgroundColor: "rgba(10, 13, 24, 0.86)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    overflow: "hidden",
    padding: 14
  },
  communityDetailHeroCopy: {
    flex: 1,
    gap: 12,
    minWidth: 0
  },
  communityDetailIconButton: {
    alignItems: "center",
    backgroundColor: "rgba(16, 18, 30, 0.86)",
    borderColor: "rgba(126, 124, 155, 0.28)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    height: 44,
    justifyContent: "center",
    minWidth: 46,
    paddingHorizontal: 12
  },
  communityDetailIconText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  communityDetailIdentity: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    justifyContent: "space-between",
    paddingTop: 2
  },
  communityDetailKicker: {
    color: "#BFAEFF",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  communityDetailDivider: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    height: 1,
    marginTop: 2
  },
  communityDetailPanel: {
    backgroundColor: "rgba(8, 11, 22, 0.86)",
    borderColor: "rgba(126, 124, 155, 0.24)",
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 15
  },
  communityDetailPanelBody: {
    color: "#C5C0CF",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 21
  },
  communityDetailPanelTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 22
  },
  communityDetailScreen: {
    flexGrow: 1,
    gap: 12,
    paddingBottom: 18,
    paddingTop: 2
  },
  communityDetailTab: {
    alignItems: "center",
    borderRadius: 10,
    flex: 1,
    justifyContent: "center",
    minHeight: 36
  },
  communityDetailTabActive: {
    backgroundColor: "rgba(139, 53, 255, 0.32)"
  },
  communityDetailTabs: {
    backgroundColor: "rgba(8, 10, 18, 0.72)",
    borderColor: "rgba(255, 255, 255, 0.09)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    padding: 4
  },
  communityDetailTabText: {
    color: "#AFA9BB",
    fontSize: 14,
    fontWeight: "900"
  },
  communityDetailTabTextActive: {
    color: colors.text
  },
  communityDetailSectionTab: {
    alignItems: "center",
    backgroundColor: "rgba(16, 18, 30, 0.74)",
    borderColor: "rgba(126, 124, 155, 0.24)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    flex: 1,
    gap: 6,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 8
  },
  communityDetailSectionTabActive: {
    backgroundColor: "rgba(126, 72, 255, 0.2)",
    borderColor: "rgba(183, 139, 255, 0.56)"
  },
  communityDetailSectionTabs: {
    flexDirection: "row",
    gap: 7
  },
  communityDetailSectionText: {
    color: "#B8B2CB",
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "900"
  },
  communityDetailSectionTextActive: {
    color: colors.text
  },
  communityDetailTag: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 999,
    borderWidth: 1,
    color: "#DCD8EA",
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  communityDetailTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7
  },
  communityDetailTitle: {
    color: colors.text,
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 34
  },
  communityDetailTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  communityDemoAction: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: communityDetailAccent,
    borderRadius: 11,
    flexDirection: "row",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 13
  },
  communityDemoActionText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  communityDemoLabel: {
    color: "#AFA9BB",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  communityDemoLineAmount: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  communityDemoLineItem: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.045)",
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 39,
    paddingHorizontal: 11
  },
  communityDemoLineText: {
    color: "#DAD6EA",
    fontSize: 13,
    fontWeight: "800"
  },
  communityDemoPanel: {
    backgroundColor: "rgba(4, 6, 15, 0.62)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 13,
    borderWidth: 1,
    gap: 11,
    padding: 12
  },
  communityDemoStatus: {
    backgroundColor: "rgba(255, 205, 92, 0.12)",
    borderColor: "rgba(255, 205, 92, 0.25)",
    borderRadius: 999,
    borderWidth: 1,
    color: "#FFD27E",
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  communityDemoStatusDone: {
    backgroundColor: "rgba(124, 241, 179, 0.12)",
    borderColor: "rgba(124, 241, 179, 0.25)",
    color: "#BDF8D8"
  },
  communityDemoTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  communityDemoValue: {
    color: colors.text,
    fontSize: 25,
    fontWeight: "900",
    lineHeight: 30,
    marginTop: 3
  },
  communityEmptyState: {
    alignItems: "center",
    backgroundColor: "rgba(8, 13, 24, 0.72)",
    borderColor: "rgba(128, 106, 180, 0.22)",
    borderRadius: 16,
    borderWidth: 1,
    gap: 7,
    minHeight: 150,
    justifyContent: "center",
    padding: 18
  },
  communityEmptyText: {
    color: "#AFAABD",
    fontSize: 13,
    fontWeight: "800"
  },
  communityEmptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900"
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
  communityHabitLogoCore: {
    borderRadius: 999,
    height: 10,
    width: 10
  },
  communityHabitLogoDot: {
    backgroundColor: "rgba(255, 255, 255, 0.38)",
    borderRadius: 999,
    height: 4,
    width: 4
  },
  communityHabitLogoDots: {
    bottom: 8,
    flexDirection: "row",
    gap: 4,
    position: "absolute"
  },
  communityHabitLogoRing: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 5,
    justifyContent: "center",
    opacity: 0.9
  },
  communityHabitDemoCopy: {
    flex: 1,
    minWidth: 0
  },
  communityHabitDemoDot: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 999,
    height: 13,
    width: 13
  },
  communityHabitDemoDotDone: {
    backgroundColor: communityDetailAccent
  },
  communityHabitDemoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  communityHabitDemoRing: {
    alignItems: "center",
    borderColor: "rgba(139, 53, 255, 0.7)",
    borderRadius: 999,
    borderWidth: 7,
    height: 74,
    justifyContent: "center",
    width: 74
  },
  communityHabitDemoRingDone: {
    borderColor: "#7CF1B3"
  },
  communityHabitDemoScore: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  communityHabitDemoTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 13
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
    lineHeight: 19
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
  communityLikeButton: {
    alignItems: "center",
    backgroundColor: "rgba(12, 15, 24, 0.5)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    height: 46,
    justifyContent: "center",
    minWidth: 74,
    paddingHorizontal: 13
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
  communityMakerBio: {
    color: "#BDB8C7",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 2
  },
  communityMakerCopy: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0
  },
  communityMakerName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22
  },
  communityMakerMiniAvatar: {
    alignItems: "center",
    borderRadius: 999,
    height: 22,
    justifyContent: "center",
    width: 22
  },
  communityMakerMiniAvatarText: {
    fontSize: 11,
    fontWeight: "900"
  },
  communityMakerMiniDot: {
    color: "#6F6A80",
    fontSize: 11,
    fontWeight: "900"
  },
  communityMakerMiniName: {
    color: "#DAD6EA",
    fontSize: 12,
    fontWeight: "900",
    maxWidth: 118
  },
  communityMakerMiniRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7
  },
  communityMakerMiniTime: {
    color: "#9D98AD",
    fontSize: 11,
    fontWeight: "800"
  },
  communityDetailMakerLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 44
  },
  communityMakerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  communityOpenedNotice: {
    alignItems: "flex-start",
    backgroundColor: "rgba(126, 72, 255, 0.1)",
    borderColor: "rgba(183, 139, 255, 0.24)",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    padding: 12
  },
  communityOpenedText: {
    color: "#CFC8DE",
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18
  },
  communityOpenButton: {
    borderRadius: 13,
    flex: 1,
    overflow: "hidden"
  },
  communityOpenGradient: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  communityOpenText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  communityPrimaryOpenButton: {
    borderRadius: 10,
    flex: 1,
    height: 46,
    minWidth: 0,
    overflow: "hidden"
  },
  communityPrimaryOpenGradient: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    height: "100%",
    justifyContent: "center",
    paddingHorizontal: 14
  },
  communityPrimaryOpenText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  communitySmallAction: {
    alignItems: "center",
    backgroundColor: "rgba(12, 15, 24, 0.5)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    height: 46,
    justifyContent: "center",
    minWidth: 78,
    paddingHorizontal: 10
  },
  communitySmallActionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  communityPictureCard: {
    backgroundColor: "rgba(16, 18, 30, 0.78)",
    borderRadius: 13,
    borderWidth: 1,
    flex: 1,
    gap: 8,
    minWidth: 142,
    padding: 10
  },
  communityPictureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  communityDetailScreenshots: {
    gap: 9
  },
  communityScreenshotGrid: {
    flexDirection: "row",
    gap: 9
  },
  communityScreenshotLabel: {
    color: "#D8D3E4",
    fontSize: 12,
    fontWeight: "900"
  },
  communityScreenshotPreview: {
    flex: 1,
    gap: 7,
    minWidth: 0
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
    gap: 12,
    minHeight: 142,
    padding: 13
  },
  communityPostCardPressed: {
    borderColor: "rgba(183, 139, 255, 0.54)",
    opacity: 0.88,
    transform: [{ scale: 0.99 }]
  },
  communityPostDescription: {
    color: "#B2AFC1",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: 4
  },
  communityPostBottom: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    justifyContent: "space-between"
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
    flex: 1,
    gap: 14
  },
  communityPostStatText: {
    color: "#B7B4C8",
    fontSize: 12,
    fontWeight: "900"
  },
  communityPostStatLiked: {
    color: "#FF9DBB"
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
  communityPostTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  communityPostTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12
  },
  communityPostOpenButton: {
    alignItems: "center",
    backgroundColor: "rgba(126, 72, 255, 0.18)",
    borderColor: "rgba(183, 139, 255, 0.36)",
    borderRadius: 10,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  communityPostOpenText: {
    color: "#D8C8FF",
    fontSize: 12,
    fontWeight: "900"
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
  communityReportButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 100, 128, 0.08)",
    borderColor: "rgba(255, 100, 128, 0.22)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 13
  },
  communityReportText: {
    color: "#FFB4C1",
    fontSize: 13,
    fontWeight: "900"
  },
  communityReportTextDone: {
    color: "#B7FBD0"
  },
  communityTabPanel: {
    gap: 14
  },
  communityDetailTopSave: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    marginRight: -8,
    width: 44
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
  contentScroll: {
    flex: 1
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
    display: "none"
  },
  messageStack: {
    gap: 10,
    minHeight: 500,
    padding: 16
  },
  messageAuthor: {
    color: "#F2EFFB",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18
  },
  messageAvatar: {
    alignItems: "center",
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    marginTop: 2,
    width: 28
  },
  messageAvatarAssistant: {
    backgroundColor: "rgba(8, 10, 20, 0.92)",
    borderColor: "rgba(139, 53, 255, 0.28)",
    borderWidth: 1
  },
  messageAvatarLogo: {
    height: 18,
    width: 18
  },
  messageAvatarUser: {
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderWidth: 1
  },
  messageContent: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  messageFile: {
    color: "#9E98AD",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16
  },
  messageRow: {
    flexDirection: "row",
    gap: 12,
    paddingBottom: 14,
    paddingTop: 14
  },
  messageRowAssistant: {
    backgroundColor: "transparent"
  },
  messageRowUser: {
    backgroundColor: "transparent"
  },
  messageText: {
    color: "#E7E3EF",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 23
  },
  messageBody: {
    gap: 6
  },
  messageBold: {
    color: "#FFFFFF",
    fontWeight: "900"
  },
  messageInlineCode: {
    backgroundColor: "rgba(139, 53, 255, 0.18)",
    borderRadius: 4,
    color: "#E2D6FF",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13.5,
    paddingHorizontal: 5,
    paddingVertical: 1
  },
  messageCodeBlock: {
    backgroundColor: "#0B0D17",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 10,
    borderWidth: 1,
    marginVertical: 4,
    overflow: "hidden"
  },
  messageCodeBlockHeader: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  messageCodeBlockLang: {
    color: "#9E98AD",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  messageCodeBlockText: {
    color: "#E5E2F0",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13,
    lineHeight: 19,
    padding: 12
  },
  messageHeading1: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 25,
    marginTop: 4
  },
  messageHeading2: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 23,
    marginTop: 2
  },
  messageHeading3: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 21
  },
  messageListRow: {
    flexDirection: "row",
    gap: 8
  },
  messageBulletDot: {
    color: "#B9B5C8",
    fontSize: 15,
    lineHeight: 23,
    width: 12
  },
  messageNumberedMarker: {
    color: "#B9B5C8",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 23,
    minWidth: 20
  },
  messageListText: {
    flex: 1
  },
  messageSpacer: {
    height: 4
  },
  typingIndicator: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    paddingTop: 6
  },
  typingDot: {
    backgroundColor: "#B49CFF",
    borderRadius: 4,
    height: 7,
    width: 7
  },
  appPreviewCard: {
    alignItems: "center",
    backgroundColor: "rgba(142, 60, 255, 0.10)",
    borderColor: "rgba(142, 60, 255, 0.35)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  appPreviewIcon: {
    alignItems: "center",
    borderRadius: 12,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  appPreviewBody: {
    flex: 1,
    minWidth: 0
  },
  appPreviewLabel: {
    color: "#B49CFF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  appPreviewTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 2
  },
  appPreviewHint: {
    color: "#AAA6BC",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2
  },
  appPreviewArrow: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    width: 20
  },
  appModalScreen: {
    backgroundColor: "#02030C",
    flex: 1
  },
  appModalHeader: {
    alignItems: "center",
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  appModalIconButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 12,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  appModalTitleStack: {
    flex: 1,
    minWidth: 0
  },
  appModalLabel: {
    color: "#B49CFF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  appModalTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 2
  },
  appModalWebContainer: {
    backgroundColor: "#0B0D17",
    flex: 1
  },
  appModalWebView: {
    backgroundColor: "transparent",
    flex: 1
  },
  appModalLoader: {
    alignItems: "center",
    backgroundColor: "#0B0D17",
    flex: 1,
    justifyContent: "center",
    ...StyleSheet.absoluteFillObject
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
    backgroundColor: "rgba(64, 24, 112, 0.82)",
    borderColor: "#A84BFF",
    borderRadius: 999,
    borderWidth: 4,
    height: 72,
    justifyContent: "center",
    shadowColor: "#8F35FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.74,
    shadowRadius: 16,
    width: 72
  },
  profileAvatarLargeText: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "900"
  },
  profileAvatarEditButton: {
    alignItems: "center",
    backgroundColor: "#242737",
    borderColor: "rgba(174, 168, 196, 0.36)",
    borderRadius: 999,
    borderWidth: 1,
    bottom: -3,
    height: 27,
    justifyContent: "center",
    position: "absolute",
    right: -3,
    width: 27
  },
  profileAvatarWrap: {
    position: "relative"
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
    backgroundColor: "rgba(10, 13, 24, 0.74)",
    borderColor: "rgba(125, 120, 142, 0.24)",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    paddingHorizontal: 13
  },
  profileGroupDangerTitle: {
    color: "#FF5D5D"
  },
  profileGroupTitle: {
    color: "#A8A2B6",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0,
    marginBottom: 8
  },
  profileHeader: {
    paddingHorizontal: 12,
    paddingTop: 24
  },
  profileContent: {
    paddingBottom: Platform.OS === "ios" ? 104 : 98,
    paddingHorizontal: 28,
    paddingTop: 16
  },
  profileDivider: {
    backgroundColor: "rgba(125, 120, 142, 0.26)",
    height: 1,
    marginTop: 12
  },
  profileHeroCard: {
    gap: 0
  },
  profileHeroTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 34,
    paddingHorizontal: 8
  },
  profilePlanBadge: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(126, 30, 188, 0.18)",
    borderColor: "rgba(194, 89, 255, 0.45)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    minHeight: 28,
    paddingHorizontal: 11
  },
  profilePlanBadgeText: {
    color: "#C259FF",
    fontSize: 14,
    fontWeight: "900"
  },
  profileRow: {
    alignItems: "center",
    borderBottomColor: "rgba(125, 120, 142, 0.18)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 38
  },
  profileRowActive: {
    backgroundColor: "rgba(126, 72, 255, 0.035)"
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
    backgroundColor: "rgba(79, 32, 129, 0.28)",
    borderRadius: 9,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  profileRowIconDanger: {
    backgroundColor: "rgba(255, 70, 92, 0.11)"
  },
  profileRowLabel: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18
  },
  profileRowLabelDanger: {
    color: "#FF465C"
  },
  profileRowLast: {
    borderBottomWidth: 0
  },
  profileRowPressed: {
    opacity: 0.74
  },
  profileRowValue: {
    color: "#AAA5B8",
    flexShrink: 0,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17
  },
  profileScreen: {
    gap: 8
  },
  profileSection: {
    gap: 0
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
  profileRenewDate: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19
  },
  profileRenewMeta: {
    color: "#A8A2B6",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17
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
    color: "#A9A3B8",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 5
  },
  profileSummaryName: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 26
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
  profileUsageDivider: {
    backgroundColor: "rgba(125, 120, 142, 0.25)",
    height: 49,
    width: 1
  },
  profileUsageIcon: {
    alignItems: "center",
    backgroundColor: "rgba(30, 31, 48, 0.86)",
    borderRadius: 12,
    height: 43,
    justifyContent: "center",
    width: 43
  },
  profileUsageItem: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minWidth: 0
  },
  profileUsageLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17
  },
  profileUsageStrip: {
    alignItems: "center",
    flexDirection: "row",
    gap: 13,
    minHeight: 58,
    paddingHorizontal: 0
  },
  profileUsageValue: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 25
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
  projectsCreateButtonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }]
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
    lineHeight: 19
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
  renameChatActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end"
  },
  renameChatCancelButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 11,
    borderWidth: 1,
    minHeight: 42,
    paddingHorizontal: 16,
    justifyContent: "center"
  },
  renameChatCancelText: {
    color: "#D8D3E4",
    fontSize: 14,
    fontWeight: "900"
  },
  renameChatCopy: {
    flex: 1,
    minWidth: 0
  },
  renameChatDialog: {
    backgroundColor: "rgba(9, 11, 21, 0.98)",
    borderColor: "rgba(139, 53, 255, 0.32)",
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
    marginHorizontal: 18,
    maxWidth: 420,
    padding: 16,
    shadowColor: "#8B35FF",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.24,
    shadowRadius: 28,
    width: "90%"
  },
  renameChatHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  renameChatIcon: {
    alignItems: "center",
    backgroundColor: "rgba(139, 53, 255, 0.18)",
    borderColor: "rgba(183, 139, 255, 0.28)",
    borderRadius: 12,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  renameChatInput: {
    backgroundColor: "rgba(16, 18, 30, 0.9)",
    borderColor: "rgba(126, 124, 155, 0.28)",
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    minHeight: 48,
    paddingHorizontal: 13
  },
  renameChatOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    flex: 1,
    justifyContent: "center"
  },
  renameChatSaveButton: {
    alignItems: "center",
    backgroundColor: "#8B35FF",
    borderRadius: 11,
    minHeight: 42,
    paddingHorizontal: 18,
    justifyContent: "center"
  },
  renameChatSaveText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  renameChatSubtitle: {
    color: "#AFA9BB",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 2
  },
  renameChatTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22
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
  statusDotOffline: {
    backgroundColor: "#FF5A6B"
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
  pcControlDisabled: {
    opacity: 0.58
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
  tokenHeroLabel: {
    color: "#FFF200",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  tokenHeroPanel: {
    gap: 14,
    paddingHorizontal: 2,
    paddingTop: 2
  },
  tokenHeroTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  tokenHeroValue: {
    color: "#F9F6FF",
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 30,
    marginTop: 3
  },
  tokenManageButton: {
    borderRadius: 13,
    overflow: "hidden",
    shadowColor: "#FFF200",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 22
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
  tokenRenewalBadge: {
    alignItems: "center",
    backgroundColor: "rgba(255, 242, 0, 0.12)",
    borderColor: "rgba(255, 242, 0, 0.36)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6
  },
  tokenRenewalText: {
    color: "#FFF200",
    fontSize: 11,
    fontWeight: "900"
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
    shadowColor: "#FFF200",
    shadowOffset: { width: 0, height: -14 },
    shadowOpacity: 0.18,
    shadowRadius: 30
  },
  tokenSheetClose: {
    alignItems: "center",
    backgroundColor: "rgba(139, 53, 255, 0.18)",
    borderColor: "rgba(255, 242, 0, 0.16)",
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
    backgroundColor: "rgba(255, 242, 0, 0.42)",
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
    backgroundColor: "rgba(255, 242, 0, 0.14)",
    borderColor: "rgba(255, 242, 0, 0.42)",
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    shadowColor: "#FFF200",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    width: 48
  },
  tokenSheetKicker: {
    color: "#FFF200",
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
    color: "#F9F6FF",
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
    backgroundColor: "rgba(139, 53, 255, 0.34)",
    borderRadius: 999,
    height: 10,
    overflow: "hidden"
  },
  tokenTrackFill: {
    borderRadius: 999,
    height: 10
  },
  pageTopTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 28
  },
  pageTopTitleBlock: {
    flex: 1,
    minWidth: 0
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
    paddingTop: 10,
    position: "relative"
  },
  chatTopActions: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: 7,
    justifyContent: "flex-end",
    minWidth: 0
  },
  chatTopBar: {
    backgroundColor: "#080A12",
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
    gap: 8,
    justifyContent: "space-between",
    paddingHorizontal: 12
  },
  chatTopIconButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.055)",
    borderColor: "rgba(126, 124, 155, 0.22)",
    borderRadius: 11,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  chatTopLeft: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 7
  },
  chatTopTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 22,
    minWidth: 0,
    textAlign: "center"
  },
  chatTopTitleWrap: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 94,
    paddingHorizontal: 6,
    position: "absolute",
    right: 94,
    top: 0
  },
  topBarChat: {
    borderBottomColor: "rgba(91, 91, 112, 0.26)",
    minHeight: 74,
    paddingHorizontal: 18
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
  dashboardLogoChat: {
    height: 38,
    width: 54
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
