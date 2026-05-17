import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part21 = {
  profileRowValue: {
    color: "#AAA5B8",
    flexShrink: 0,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17
  },
  profileScreen: {
    flex: 1,
    flexGrow: 1,
    gap: 18,
    justifyContent: "flex-start",
    paddingBottom: 116
  },
  profileSection: {
    gap: 0
  },
  profileStat: {
    alignItems: "center",
    borderRightColor: "rgba(125, 120, 142, 0.22)",
    borderRightWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 75
  },
  profileStatIcon: {
    alignItems: "center",
    backgroundColor: "rgba(75, 34, 132, 0.28)",
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  profileStatLabel: {
    color: "#B7B3C4",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    marginTop: 3
  },
  profileStatLast: {
    borderRightWidth: 0
  },
  profileStatsPanel: {
    backgroundColor: "rgba(21, 22, 34, 0.72)",
    borderColor: "rgba(113, 108, 132, 0.28)",
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 20,
    overflow: "hidden"
  },
  profileStatValue: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 25
  },
  profileRenewDate: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18
  },
  profileRenewMeta: {
    color: "#A8A2B6",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 15
  },
  profileSummaryCard: {
    backgroundColor: "rgba(14, 17, 28, 0.9)",
    borderColor: "rgba(139, 60, 255, 0.48)",
    borderRadius: 13,
    borderWidth: 1,
    padding: 20
  },
  profileSummaryCopy: {
    flex: 1,
    minWidth: 0
  },
  profileSummaryEmail: {
    color: "#A9A3B8",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 3
  },
  profileSummaryName: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 24
  },
  profileSummaryTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 21
  },
  profileTab: {
    alignItems: "center",
    backgroundColor: "rgba(18, 19, 30, 0.82)",
    borderColor: "rgba(112, 105, 133, 0.34)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 45,
    paddingHorizontal: 9
  },
  profileTabActive: {
  },
  profileTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    paddingHorizontal: 12
  },
  profileTabText: {
    color: "#BAB5CA",
    fontSize: 12,
    fontWeight: "900"
  },
  profileTabTextActive: {
  },
  profileUsageDivider: {
    backgroundColor: "rgba(125, 120, 142, 0.25)",
    height: 40,
    width: 1
  },
  profileUsageIcon: {
    alignItems: "center",
    backgroundColor: "rgba(30, 31, 48, 0.86)",
    borderRadius: 11,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  profileUsageItem: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 8,
    minWidth: 0
  },
  profileUsageLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 15
  },
  profileUsageStrip: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    minHeight: 48,
    paddingHorizontal: 0
  },
  profileUsageValue: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 23
  },
  projectsBackdrop: {
    ...StyleSheet.absoluteFillObject
  },
} as const;
