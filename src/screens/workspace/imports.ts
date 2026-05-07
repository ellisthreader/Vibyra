export { Ionicons } from "@expo/vector-icons";
export { LinearGradient } from "expo-linear-gradient";
export {
  ActivityIndicator,
  Animated,
  Image,
  ImageBackground,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
export type {
  ImageStyle,
  StyleProp,
  TextStyle,
  ViewStyle
} from "react-native";
export { default as Svg, Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from "react-native-svg";
export { AppWebView } from "../../components/AppWebView";
export { VibyraLogo } from "../../components/VibyraLogo";
export { colors } from "../../styles/theme";
export type { Agent, ChatMessage, GeneratedApp, ModelKey, Project, RememberedDesktop } from "../../types/domain";
export {
  aiChatGlyph,
  chatBuildAiHero,
  communityHero,
  dashboardHeroArt,
  projectsBackdrop,
  projectsFoldersHero,
  vibyraLogo
} from "./data/assets";
export {
  chatModelGroups,
  chatModelOptions,
  providerLogoSources
} from "./data/chatModels";
export {
  COMMUNITY_COMMENTS_KEY,
  communityDetailAccent,
  communityDetailAccentDark,
  communityPosts
} from "./data/community";
export {
  chatSuggestions,
  pages,
  previousChats,
  projectFilterModes,
  projectStatuses,
  tokenMembership
} from "./data/pages";
export { styles } from "./styles";
export type {
  ChatModelOption,
  ChatModelProvider,
  CommunityComment,
  CommunityDetailTab,
  CommunityFilter,
  CommunityLogoKind,
  CommunityPost,
  CommunityPreviewKind,
  DashboardPage,
  DesktopCandidate,
  ProjectDisplay,
  ProjectLayout,
  SettingsTab
} from "./types";
