import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part19 = {
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
} as const;
