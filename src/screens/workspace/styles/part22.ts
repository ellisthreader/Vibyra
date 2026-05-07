import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part22 = {
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
};
