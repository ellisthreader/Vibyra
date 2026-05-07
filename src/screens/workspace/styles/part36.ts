import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part36 = {
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
};
