import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part7 = {
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
};
