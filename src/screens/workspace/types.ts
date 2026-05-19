import { ImageStyle, StyleProp, TextStyle, ViewStyle } from "react-native";
import { ModelKey, Project, RememberedDesktop } from "../../types/domain";

export type DashboardPage = "dashboard" | "projects" | "chat" | "community" | "profile";
export type SettingsTab = "profile" | "billing" | "preferences" | "security" | "usage";
export type DesktopCandidate = RememberedDesktop;

export type ChatModelProvider = "auto" | "claude" | "openai" | "gemini";
export type ChatModelOption = {
  badge?: "New";
  key: string;
  label: string;
  locked?: boolean;
  provider: ChatModelProvider;
  modelKey?: ModelKey;
};

export type CommunityLogoKind = "analytics" | "default" | "habit" | "invoice";
export type CommunityPreviewKind = "analytics" | "habit" | "invoice";
export type CommunityFilter = "All" | "Recent" | "Popular" | "Featured";
export type CommunityDetailTab = "about" | "comments";

export type CommunityComment = {
  id: string;
  name: string;
  text: string;
  time: string;
};

export type CommunityPost = {
  accent: string;
  appUrl: string;
  about: string;
  comments: number;
  description: string;
  id: string;
  isPublic?: boolean;
  likes: number;
  logoImageUrl?: string | null;
  logo?: CommunityLogoKind;
  makerBio: string;
  preview: CommunityPreviewKind;
  reviewStatus?: string;
  screenshots: string[];
  screenshotUrls?: string[];
  tag: CommunityFilter;
  tags: string[];
  time: string;
  title: string;
  user: string;
};

export type ProjectDisplay = {
  id: string;
  name: string;
  path: string;
  sourceProject?: Project;
  stack: string;
  status: ProjectStatus;
  updated: string;
};

export type ProjectStatus = "Active" | "Draft" | "Published" | "Archived" | "On PC" | "On mobile";

export type ProjectLayout = {
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
