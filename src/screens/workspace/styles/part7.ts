import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part7 = {
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
    overflow: "hidden",
    shadowColor: "#8E3CFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10
  },
  chatSendButtonPressed: {
    transform: [{ scale: 0.94 }]
  },
  chatSendGradient: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40
  },
  chatSuggestionCard: {
    alignItems: "flex-start",
    backgroundColor: "rgba(16, 18, 28, 0.74)",
    borderColor: "rgba(200, 168, 255, 0.14)",
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    gap: 10,
    justifyContent: "space-between",
    minHeight: 106,
    minWidth: 0,
    overflow: "hidden",
    padding: 13
  },
  chatSuggestionCardPressed: {
    backgroundColor: "rgba(142, 60, 255, 0.13)",
    borderColor: "rgba(200, 168, 255, 0.30)",
    transform: [{ scale: 0.98 }]
  },
  chatSuggestionIconPlate: {
    alignItems: "center",
    borderRadius: 10,
    height: 34,
    justifyContent: "center",
    marginBottom: 4,
    overflow: "hidden",
    width: 34
  },
  chatSuggestionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 20,
    maxWidth: 330,
    paddingHorizontal: 10,
    width: "100%"
  },
  chatSuggestionIcon: {
    alignItems: "center",
    backgroundColor: "rgba(142, 60, 255, 0.16)",
    borderColor: "rgba(200, 168, 255, 0.18)",
    borderRadius: 10,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32
  },
} as const;
