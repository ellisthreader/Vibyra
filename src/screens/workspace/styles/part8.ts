import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part8 = {
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
} as const;
