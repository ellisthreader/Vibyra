import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part9 = {
  communityAppIcon: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  communityBarChart: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 5,
    height: 40,
    marginTop: 10
  },
  communityBookmark: {
    alignItems: "center",
    backgroundColor: "rgba(19, 22, 35, 0.62)",
    borderColor: "rgba(118, 114, 138, 0.34)",
    borderRadius: 8,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  communityAvatarLarge: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    height: 50,
    justifyContent: "center",
    width: 50
  },
  communityAvatarLargeText: {
    fontSize: 22,
    fontWeight: "900"
  },
  communityAnalyticsBars: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 8,
    height: 112
  },
  communityAnalyticsDemoBar: {
    backgroundColor: communityDetailAccent,
    borderRadius: 999,
    flex: 1,
    shadowColor: communityDetailAccent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 8
  },
  communityAnalyticsDemoHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  communityAnalyticsRange: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.09)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    padding: 4
  },
  communityAnalyticsRangeOption: {
    alignItems: "center",
    borderRadius: 7,
    minHeight: 29,
    minWidth: 42,
    justifyContent: "center"
  },
  communityAnalyticsRangeOptionActive: {
    backgroundColor: "rgba(139, 53, 255, 0.44)"
  },
  communityAnalyticsRangeText: {
    color: "#AFA9BB",
    fontSize: 12,
    fontWeight: "900"
  },
  communityAnalyticsRangeTextActive: {
    color: colors.text
  },
  communityAppExperience: {
    backgroundColor: "rgba(8, 11, 22, 0.9)",
    borderColor: "rgba(139, 53, 255, 0.34)",
    borderRadius: 16,
    borderWidth: 1,
    gap: 13,
    padding: 14,
    shadowColor: communityDetailAccent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 18
  },
  communityAppExperienceHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  communityAppExperienceKicker: {
    color: "#BFAEFF",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  communityAppExperienceTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22,
    marginTop: 3
  },
  communityOpenedAppCopy: {
    flex: 1,
    minWidth: 0
  },
  communityOpenedAppIntro: {
    alignItems: "center",
    backgroundColor: "rgba(8, 11, 22, 0.78)",
    borderColor: "rgba(139, 53, 255, 0.22)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    padding: 14
  },
  communityOpenedAppKicker: {
    color: "#BFAEFF",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  communityOpenedAppScreen: {
    flexGrow: 1,
    gap: 14,
    paddingBottom: 18
  },
  communityOpenedAppSubtitle: {
    color: "#BDB8C7",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 5
  },
  communityOpenedAppTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 25,
    marginTop: 3
  },
  communityAppLiveDot: {
    backgroundColor: "#7CF1B3",
    borderRadius: 999,
    height: 7,
    width: 7
  },
} as const;
