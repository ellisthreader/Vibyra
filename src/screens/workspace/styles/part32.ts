import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part32 = {
  runningProjectsEmptyText: {
    color: "#B8B4C4",
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 23,
    textAlign: "center"
  },
  runningProjectsEmptyTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 30,
    textAlign: "center"
  },
  runningProjectsList: {
    gap: 12
  },
  runningProjectsScroll: {
    maxHeight: 430
  },
  runningProjectsScrollContent: {
    gap: 12,
    paddingBottom: 2
  },
  runningProjectsPanel: {
    gap: 14
  },
  runningProjectsPanelEmpty: {
    flex: 1,
    justifyContent: "center",
    paddingBottom: 96
  },
  runningProjectTask: {
    color: "#B8B4C4",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 3
  },
  runningProjectTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12
  },
  homeQueueStats: {
    flexDirection: "row",
    gap: 10
  },
  homeQueueStat: {
    backgroundColor: "rgba(7, 10, 20, 0.82)",
    borderColor: "rgba(118, 74, 202, 0.36)",
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    minHeight: 74,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  homeQueueStatValue: {
    color: "#D18BFF",
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 38
  },
  homeQueueStatValueQueued: {
    color: "#8CC8FF"
  },
  homeQueueStatLabel: {
    color: "#A855FF",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
    marginTop: 2,
    textTransform: "uppercase"
  },
  homeQueueStatLabelQueued: {
    color: "#4CA3FF"
  },
  homeQueueSection: {
    gap: 10
  },
  homeQueueSectionTitle: {
    color: "#AAA7B7",
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 19
  },
  runningProjectMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    marginTop: 8
  },
  runningProjectMetaDot: {
    backgroundColor: "#A855FF",
    borderRadius: 999,
    height: 8,
    width: 8
  },
  runningProjectMetaDotQueued: {
    backgroundColor: "#4CA3FF"
  },
  runningProjectMetaText: {
    color: "#A855FF",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17
  },
  runningProjectMetaTextQueued: {
    color: "#4CA3FF"
  },
  runningProjectMetaSep: {
    color: "#7C798A",
    fontSize: 13,
    fontWeight: "900"
  },
  runningProjectMetaMuted: {
    color: "#AAA7B7",
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17
  },
  runningProjectBottom: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginTop: 12
  },
  runningProjectPercent: {
    color: "#A855FF",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19
  },
} as const;
