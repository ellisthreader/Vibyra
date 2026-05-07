import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part11 = {
  communityDefaultLogoOrb: {
    borderRadius: 999,
    position: "absolute",
    right: 10,
    top: 10
  },
  communityFilterButton: {
    alignItems: "center",
    backgroundColor: "rgba(15, 17, 29, 0.8)",
    borderColor: "rgba(118, 101, 171, 0.3)",
    borderRadius: 11,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  communityDetailActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7
  },
  communityDetailBack: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    marginLeft: -10,
    width: 44
  },
  communityDetailDescription: {
    color: "#B9B4C6",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 21,
    marginTop: 8
  },
  communityDetailHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 42
  },
  communityDetailHeaderCopy: {
    flex: 1,
    minWidth: 0
  },
  communityDetailHero: {
    alignItems: "center",
    backgroundColor: "rgba(10, 13, 24, 0.86)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    overflow: "hidden",
    padding: 14
  },
  communityDetailHeroCopy: {
    flex: 1,
    gap: 12,
    minWidth: 0
  },
  communityDetailIconButton: {
    alignItems: "center",
    backgroundColor: "rgba(16, 18, 30, 0.86)",
    borderColor: "rgba(126, 124, 155, 0.28)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    height: 44,
    justifyContent: "center",
    minWidth: 46,
    paddingHorizontal: 12
  },
  communityDetailIconText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  communityDetailIdentity: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    justifyContent: "space-between",
    paddingTop: 2
  },
  communityDetailKicker: {
    color: "#BFAEFF",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  communityDetailDivider: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    height: 1,
    marginTop: 2
  },
  communityDetailPanel: {
    backgroundColor: "rgba(8, 11, 22, 0.86)",
    borderColor: "rgba(126, 124, 155, 0.24)",
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 15
  },
  communityDetailPanelBody: {
    color: "#C5C0CF",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 21
  },
  communityDetailPanelTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 22
  },
  communityDetailScreen: {
    flexGrow: 1,
    gap: 12,
    paddingBottom: 18,
    paddingTop: 2
  },
  communityDetailTab: {
    alignItems: "center",
    borderRadius: 10,
    flex: 1,
    justifyContent: "center",
    minHeight: 36
  },
  communityDetailTabActive: {
    backgroundColor: "rgba(139, 53, 255, 0.32)"
  },
  communityDetailTabs: {
    backgroundColor: "rgba(8, 10, 18, 0.72)",
    borderColor: "rgba(255, 255, 255, 0.09)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    padding: 4
  },
  communityDetailTabText: {
    color: "#AFA9BB",
    fontSize: 14,
    fontWeight: "900"
  },
  communityDetailTabTextActive: {
    color: colors.text
  },
  communityDetailSectionTab: {
    alignItems: "center",
    backgroundColor: "rgba(16, 18, 30, 0.74)",
    borderColor: "rgba(126, 124, 155, 0.24)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    flex: 1,
    gap: 6,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 8
  },
  communityDetailSectionTabActive: {
    backgroundColor: "rgba(126, 72, 255, 0.2)",
    borderColor: "rgba(183, 139, 255, 0.56)"
  },
} as const;
