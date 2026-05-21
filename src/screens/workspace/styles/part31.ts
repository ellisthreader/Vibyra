import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part31 = {
  dashboardPage: {
    flex: 1,
    gap: 12,
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
    backgroundColor: "rgba(7, 10, 20, 0.82)",
    borderColor: "rgba(118, 74, 202, 0.36)",
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 92,
    overflow: "hidden",
    padding: 14,
    position: "relative"
  },
  runningProjectCardRunning: {
    backgroundColor: "rgba(11, 7, 25, 0.9)",
    borderColor: "rgba(145, 57, 255, 0.78)"
  },
  runningProjectCardWaiting: {
    backgroundColor: "rgba(7, 10, 20, 0.86)",
    borderColor: "rgba(83, 91, 122, 0.48)"
  },
  runningProjectCopy: {
    flex: 1,
    minWidth: 0
  },
  runningProjectIcon: {
    alignItems: "center",
    backgroundColor: "rgba(109, 59, 255, 0.2)",
    borderColor: "rgba(170, 88, 255, 0.18)",
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  runningProjectIconWaiting: {
    backgroundColor: "rgba(23, 89, 170, 0.18)",
    borderColor: "rgba(76, 163, 255, 0.18)"
  },
  runningProjectName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 21
  },
  runningProjectBeamFill: {
    borderRadius: 999,
    backgroundColor: "#B36DFF",
    height: "100%"
  },
  runningProjectBeamTrack: {
    backgroundColor: "rgba(75, 78, 94, 0.52)",
    borderRadius: 999,
    flex: 1,
    height: 6,
    overflow: "hidden",
    width: "100%"
  },
  runningProjectBeamQueued: {
    backgroundColor: "rgba(170, 166, 188, 0.56)"
  },
  runningProjectsEmpty: {
    alignItems: "center",
    alignSelf: "center",
    gap: 17,
    justifyContent: "center",
    maxWidth: 330,
    minHeight: 485,
    paddingHorizontal: 18,
    width: "100%"
  },
  runningProjectsEmptyButton: {
    borderRadius: 16,
    alignSelf: "center",
    marginTop: 4,
    overflow: "hidden",
    shadowColor: "#9631FF",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.34,
    shadowRadius: 18,
    width: 254
  },
  runningProjectsEmptyButtonGradient: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 17
  },
  runningProjectsEmptyButtonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }]
  },
  runningProjectsEmptyButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20
  },
  runningProjectsEmptyCopy: {
    alignItems: "center",
    gap: 8,
    maxWidth: 300
  },
  runningProjectsEmptyImage: {
    height: 194,
    marginBottom: 10,
    marginTop: 16,
    width: 230
  },
  runningProjectsEmptyIcon: {
    alignItems: "center",
    backgroundColor: "rgba(109, 59, 255, 0.2)",
    borderColor: "rgba(216, 184, 255, 0.16)",
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
} as const;
