import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part17 = {
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
    fontSize: 12.5,
    fontWeight: "900",
    letterSpacing: 0.2,
    lineHeight: 17
  },
  messageAuthorAssistant: {
    color: "#D7C4FF"
  },
  messageAvatar: {
    alignItems: "center",
    borderRadius: 999,
    height: 30,
    justifyContent: "center",
    marginTop: 1,
    width: 30
  },
  messageAvatarAssistant: {
    backgroundColor: "rgba(12, 10, 26, 0.95)",
    borderColor: "rgba(176, 132, 255, 0.42)",
    borderWidth: 1,
    shadowColor: "#8E3CFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8
  },
  messageAvatarLogo: {
    height: 18,
    width: 18
  },
  messageAvatarUser: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderWidth: 1
  },
  messageContent: {
    flex: 1,
    gap: 5,
    minWidth: 0
  },
  messageFile: {
    color: "#9E98AD",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 11.5,
    fontWeight: "700",
    lineHeight: 15
  },
  messageRow: {
    flexDirection: "row",
    gap: 12,
    paddingBottom: 12,
    paddingTop: 12
  },
  messageRowAssistant: {
    backgroundColor: "transparent"
  },
  messageRowUser: {
    backgroundColor: "transparent"
  },
  messageUserBubble: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(176, 132, 255, 0.10)",
    borderColor: "rgba(176, 132, 255, 0.18)",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  messageText: {
    color: "#EAE5F4",
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 23
  },
  messageBody: {
    gap: 6
  },
  messageBold: {
    color: "#FFFFFF",
    fontWeight: "900"
  },
} as const;
