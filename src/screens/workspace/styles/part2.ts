import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part2 = {
  chatArtStarLarge: {
    backgroundColor: "#C179FF",
    height: 10,
    left: 32,
    position: "absolute",
    top: 33,
    transform: [{ rotate: "45deg" }],
    width: 10
  },
  chatArtStarSmall: {
    backgroundColor: "#9A4DFF",
    height: 6,
    position: "absolute",
    right: 5,
    top: 55,
    transform: [{ rotate: "45deg" }],
    width: 6
  },
  chatAssistantPanel: {
    flex: 1,
    gap: 0,
    justifyContent: "flex-end",
    minHeight: 0,
    paddingBottom: Platform.OS === "ios" ? 8 : 2
  },
  chatComposer: {
    backgroundColor: "rgba(15, 17, 26, 0.92)",
    borderColor: "rgba(176, 132, 255, 0.18)",
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 118,
    paddingBottom: 12,
    paddingHorizontal: 14,
    paddingTop: 14,
    shadowColor: "#8E3CFF",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 22
  },
  chatComposerFocused: {
    borderColor: "rgba(176, 132, 255, 0.42)",
    shadowOpacity: 0.22,
    shadowRadius: 26
  },
  chatComposerBottom: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    marginTop: 16
  },
  chatComposerInput: {
    color: "#F3F1FA",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
    maxHeight: 100,
    minHeight: 32,
    padding: 0,
    textAlignVertical: "top"
  },
  chatComposerTool: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  chatEffortPill: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.045)",
    borderColor: "rgba(176, 132, 255, 0.18)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    height: 36,
    paddingHorizontal: 9,
  },
  chatEffortPillLabel: {
    color: "#DAD6E7",
    fontSize: 12.5,
    fontWeight: "800",
    letterSpacing: 0.2
  },
  chatEffortMenu: {
    backgroundColor: "#13131F",
    borderColor: "rgba(176, 132, 255, 0.24)",
    borderRadius: 14,
    borderWidth: 1,
    bottom: 148,
    overflow: "hidden",
    padding: 6,
    position: "absolute",
    right: 56,
    shadowColor: "#8E3CFF",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    width: 260,
    zIndex: 20
  },
  chatEffortMenuRow: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  chatEffortMenuRowActive: {
    backgroundColor: "rgba(176, 132, 255, 0.16)"
  },
  chatEffortMenuLabel: {
    color: "#F2EFFB",
    flex: 1,
    fontSize: 13.5,
    fontWeight: "800"
  },
  chatEffortMenuLabelActive: {
    color: "#FFFFFF"
  },
  chatEffortMenuHint: {
    color: "#8F8A9E",
    fontSize: 11.5,
    fontWeight: "700"
  },
  chatComposerTools: {
    alignItems: "center",
    flexDirection: "row",
    flex: 1,
    gap: 8,
    minWidth: 0
  },
  chatComposerShell: {
    paddingTop: 10,
    position: "relative",
    zIndex: 10
  },
} as const;
