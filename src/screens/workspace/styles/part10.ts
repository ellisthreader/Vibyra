import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part10 = {
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
  communityAppLivePill: {
    alignItems: "center",
    backgroundColor: "rgba(124, 241, 179, 0.1)",
    borderColor: "rgba(124, 241, 179, 0.24)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 28,
    paddingHorizontal: 10
  },
  communityAppLiveText: {
    color: "#C9F8DD",
    fontSize: 11,
    fontWeight: "900"
  },
  communityCalendar: {
    alignContent: "center",
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    padding: 13
  },
  communityCalendarDot: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 999,
    height: 8,
    width: 8
  },
  communityChartBar: {
    borderRadius: 2,
    width: 7
  },
  communityInvoiceCoin: {
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderRadius: 999,
    position: "absolute"
  },
  communityInvoiceLine: {
    backgroundColor: "rgba(255, 255, 255, 0.74)",
    borderRadius: 999,
    height: 4,
    marginTop: 5
  },
  communityInvoicePage: {
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    borderColor: "rgba(255, 255, 255, 0.34)",
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 6
  },
  communityCommentCopy: {
    flex: 1,
    minWidth: 0
  },
  communityCommentCount: {
    color: "#B7B1C6",
    fontSize: 14,
    fontWeight: "900"
  },
};
