import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part5 = {
  chatLandingPrimaryMeta: {
    color: "#D7C6FF",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 3
  },
  chatLandingPrimaryTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22
  },
  chatLandingScreen: {
    flex: 1,
    gap: 9,
    overflow: "hidden",
    position: "relative",
    width: "100%"
  },
  chatLandingSubtitle: {
    color: "#AAA5BB",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 23,
    marginTop: 10,
    maxWidth: 205
  },
  chatLandingTitle: {
    color: colors.text,
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 41,
    marginTop: 10,
    textShadow: "0px 2px 4px rgba(255, 255, 255, 0.24)"
  },
  chatHeroOrb: {
    borderRadius: 999,
    height: 118,
    shadowColor: "#8B35FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.72,
    shadowRadius: 26,
    width: 118
  },
  chatHeroVisual: {
    alignItems: "center",
    flexShrink: 0,
    height: 170,
    justifyContent: "center",
    marginRight: -2,
    maxWidth: 228,
    minWidth: 148,
    width: "46%"
  },
  chatPreviousCopy: {
    flex: 1,
    minWidth: 0
  },
  chatPreviousCount: {
    color: "#A9A5B8",
    fontSize: 12,
    fontWeight: "900"
  },
  chatPreviousHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  chatPreviousIcon: {
    alignItems: "center",
    backgroundColor: "rgba(55, 56, 76, 0.62)",
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 12,
    borderWidth: 1,
    height: 43,
    justifyContent: "center",
    width: 43
  },
  chatPreviousIconRunning: {
    backgroundColor: "rgba(58, 194, 115, 0.16)",
    borderColor: "rgba(112, 240, 162, 0.28)"
  },
  chatPreviousList: {
    gap: 10,
    paddingTop: 10
  },
  chatPreviousMeta: {
    color: "#A9A5B8",
    fontSize: 12,
    fontWeight: "800"
  },
  chatPreviousMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    marginTop: 4
  },
  chatPreviousPanel: {
    backgroundColor: "rgba(11, 12, 28, 0.72)",
    borderColor: "rgba(134, 70, 211, 0.24)",
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    minHeight: 0,
    padding: 13
  },
  chatPreviousRow: {
    alignItems: "center",
    backgroundColor: "rgba(17, 19, 33, 0.86)",
    borderColor: "rgba(111, 107, 132, 0.28)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    minHeight: 66,
    paddingHorizontal: 12
  },
  chatPreviousRowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19
  },
  chatPreviousTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  chatPreviewIconRunning: {
    backgroundColor: "rgba(43, 96, 79, 0.28)"
  },
  chatRecentActiveDot: {
    backgroundColor: "#2EDB78",
    borderRadius: 999,
    height: 8,
    left: -5,
    position: "absolute",
    shadowColor: "#2EDB78",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 8,
    top: 38,
    width: 8
  },
  chatRecentBadge: {
    backgroundColor: "rgba(111, 50, 191, 0.2)",
    borderColor: "rgba(141, 72, 235, 0.22)",
    borderRadius: 8,
    borderWidth: 1,
    color: "#B678FF",
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  chatRecentCopy: {
    flex: 1,
    minWidth: 0
  },
} as const;
