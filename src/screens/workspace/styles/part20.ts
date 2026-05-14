import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const part20 = {
  profileAvatarLargeText: {
    color: colors.text,
    fontSize: 29,
    fontWeight: "900"
  },
  profileAvatarEditButton: {
    alignItems: "center",
    backgroundColor: "#242737",
    borderColor: "rgba(174, 168, 196, 0.36)",
    borderRadius: 999,
    borderWidth: 1,
    bottom: -6,
    height: 34,
    justifyContent: "center",
    position: "absolute",
    right: -6,
    width: 34
  },
  profileAvatarWrap: {
    position: "relative"
  },
  profileConnectionDot: {
    backgroundColor: "#55D77D",
    borderRadius: 999,
    height: 9,
    width: 9
  },
  profileConnectionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 11
  },
  profileConnectionText: {
    color: "#6FEA8E",
    fontSize: 15,
    fontWeight: "900"
  },
  profileEditButton: {
    alignItems: "center",
    backgroundColor: "rgba(35, 35, 49, 0.86)",
    borderColor: "rgba(113, 108, 132, 0.32)",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 39,
    paddingHorizontal: 16
  },
  profileEditText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  profileGroup: {
    backgroundColor: "rgba(10, 13, 24, 0.74)",
    borderColor: "rgba(125, 120, 142, 0.24)",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
    paddingHorizontal: 11
  },
  profileGroupDangerTitle: {
    color: "#FF5D5D"
  },
  profileGroupTitle: {
    color: "#A8A2B6",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0,
    marginBottom: 4
  },
  profileHeader: {
    paddingHorizontal: 12,
    paddingTop: 24
  },
  profileContent: {
    paddingBottom: 0,
    paddingHorizontal: 16,
    paddingTop: 0
  },
  profileDivider: {
    backgroundColor: "rgba(125, 120, 142, 0.26)",
    height: 1,
    marginTop: 12
  },
  profileHeroCard: {
    gap: 8,
    paddingBottom: 4,
    paddingTop: 10
  },
  profileHeroTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 24,
    paddingHorizontal: 6
  },
  profileLevelCopy: {
    flex: 1,
    minWidth: 0
  },
  profileLevelExpandRail: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    width: 28
  },
  profileLevelExpanded: {
    gap: 12,
    paddingTop: 2
  },
  profileLevelFill: {
    backgroundColor: "#8B5CFF",
    borderRadius: 999,
    height: "100%",
    minWidth: 6
  },
  profileLevelHelpButton: {
    alignItems: "center",
    backgroundColor: "rgba(15, 15, 24, 0.92)",
    borderColor: "rgba(139, 92, 255, 0.22)",
    borderRadius: 999,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  profileLevelHelpIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 10,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  profileLevelHelpPanel: {
    backgroundColor: "rgba(42, 42, 50, 0.98)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 10,
    borderWidth: 1,
    elevation: 12,
    gap: 10,
    padding: 12,
    position: "absolute",
    right: 56,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    top: 58,
    width: 282,
    zIndex: 40
  },
  profileLevelHelpRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10
  },
  profileLevelHelpText: {
    color: "#C8C3D3",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16
  },
  profileLevelHelpTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16
  },
  profileLevelHeaderBadge: {
    alignItems: "center",
    backgroundColor: "rgba(139, 53, 255, 0.16)",
    borderColor: "rgba(194, 89, 255, 0.3)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6
  },
  profileLevelHeaderBadgeText: {
    color: "#DDBBFF",
    fontSize: 12,
    fontWeight: "900"
  },
  profileLevelMeta: {
    color: "#AAA5B8",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16
  },
  profileLevelMap: {
    backgroundColor: "rgba(15, 15, 24, 0.92)",
    borderColor: "rgba(139, 92, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden"
  },
  profileLevelMapBody: {
    flex: 1,
    minWidth: 0
  },
  profileLevelMapLine: {
    backgroundColor: "rgba(221, 187, 255, 0.28)",
    flex: 1,
    width: 2
  },
  profileLevelMapLineHidden: {
    opacity: 0
  },
  profileLevelMapMeta: {
    color: "#9C97AE",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15
  },
  profileLevelMapRank: {
    color: "#DDBBFF",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
    marginTop: 1
  },
  profileLevelMapFooter: {
    alignItems: "center",
    borderTopColor: "rgba(221, 187, 255, 0.12)",
    borderTopWidth: 1,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  profileLevelMapFooterText: {
    color: "#9C97AE",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15
  },
  profileLevelMapNoReward: {
    color: "#656073",
    flexShrink: 0,
    fontSize: 11,
    fontWeight: "900",
    minWidth: 42,
    textAlign: "right"
  },
  profileLevelMapNode: {
    alignItems: "center",
    backgroundColor: "rgba(30, 31, 48, 0.92)",
    borderColor: "rgba(142, 137, 163, 0.38)",
    borderRadius: 999,
    borderWidth: 1,
    height: 24,
    justifyContent: "center",
    width: 24
  },
  profileLevelMapNodeComplete: {
    backgroundColor: "#8B5CFF",
    borderColor: "#8B5CFF"
  },
  profileLevelMapNodeCurrent: {
    backgroundColor: "#C259FF",
    borderColor: "#C259FF"
  },
  profileLevelMapReward: {
    alignItems: "center",
    backgroundColor: "rgba(139, 53, 255, 0.16)",
    borderColor: "rgba(194, 89, 255, 0.3)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    flexShrink: 0,
    gap: 4,
    minWidth: 68,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  profileLevelMapRewardText: {
    color: "#DDBBFF",
    fontSize: 11,
    fontWeight: "900"
  },
  profileLevelMapCollapse: {
    alignItems: "center",
    borderTopColor: "rgba(221, 187, 255, 0.12)",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  profileLevelMapRoute: {
    alignItems: "center",
    alignSelf: "stretch",
    width: 28
  },
  profileLevelMapRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 10
  },
  profileLevelMapTitle: {
    color: "#DAD6F6",
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18
  },
  profileLevelMapTitleCurrent: {
    color: "#FFFFFF"
  },
  profileLevelMapToggle: {
    alignItems: "center",
    backgroundColor: "rgba(139, 53, 255, 0.2)",
    borderColor: "rgba(194, 89, 255, 0.34)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 14
  },
  profileLevelMapToggleText: {
    color: "#EDE9FF",
    fontSize: 12,
    fontWeight: "900"
  },
  profileLevelPanel: {
    flex: 1,
    gap: 5,
    overflow: "hidden",
    paddingHorizontal: 0,
    paddingVertical: 3
  },
  profileLevelReward: {
    color: "#FFD166",
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 14,
    textAlign: "right"
  },
  profileLevelRewardPill: {
    alignItems: "center",
    backgroundColor: "rgba(255, 179, 71, 0.13)",
    borderColor: "rgba(255, 179, 71, 0.3)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    flexShrink: 1,
    gap: 5,
    maxWidth: 116,
    paddingHorizontal: 7,
    paddingVertical: 5
  },
  profileLevelShell: {
    alignItems: "stretch",
    flexDirection: "row",
    gap: 7,
    paddingBottom: 5,
    paddingHorizontal: 6,
    paddingTop: 5
  },
  profileLevelStat: {
    alignItems: "center",
    backgroundColor: "rgba(18, 18, 26, 0.62)",
    borderColor: "rgba(221, 187, 255, 0.14)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    minWidth: 0,
    paddingHorizontal: 6,
    paddingVertical: 9
  },
  profileLevelStatsRow: {
    flexDirection: "row",
    gap: 8
  },
  profileLevelStatLabel: {
    color: "#9C97AE",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 13,
    textAlign: "center"
  },
  profileLevelStatValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 16,
    textAlign: "center"
  },
  profileLevelTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18
  },
  profileLevelTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minWidth: 0
  },
  profileLevelTrack: {
    backgroundColor: "rgba(125, 120, 142, 0.2)",
    borderRadius: 999,
    height: 5,
    overflow: "hidden"
  },
  profileLevelModalContent: {
    gap: 14,
    paddingBottom: 28,
    paddingHorizontal: 18
  },
  profileLevelModalEmblem: {
    alignItems: "center",
    backgroundColor: "rgba(139, 53, 255, 0.18)",
    borderColor: "rgba(194, 89, 255, 0.34)",
    borderRadius: 16,
    borderWidth: 1,
    height: 56,
    justifyContent: "center",
    width: 56
  },
  profileLevelModalHero: {
    backgroundColor: "rgba(15, 15, 24, 0.92)",
    borderColor: "rgba(139, 92, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    overflow: "hidden",
    padding: 16
  },
  profileLevelModalHeroTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 13
  },
  profileLevelModalKicker: {
    color: "#DDBBFF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
    lineHeight: 13,
    textTransform: "uppercase"
  },
  profileLevelModalMeta: {
    color: "#B8B3CB",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 2
  },
  profileLevelModalRank: {
    color: "#DDBBFF",
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
    marginTop: 2
  },
  profileLevelModalReward: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(139, 53, 255, 0.16)",
    borderColor: "rgba(194, 89, 255, 0.3)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    maxWidth: "100%",
    paddingHorizontal: 11,
    paddingVertical: 8
  },
  profileLevelModalRewardText: {
    color: "#DDBBFF",
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17
  },
  profileLevelModalTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 33
  },
  profilePlanBadge: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(126, 30, 188, 0.18)",
    borderColor: "rgba(194, 89, 255, 0.45)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    marginTop: 5,
    minHeight: 22,
    paddingHorizontal: 8
  },
  profilePlanBadgeText: {
    color: "#C259FF",
    fontSize: 12,
    fontWeight: "900"
  },
  profileRow: {
    alignItems: "center",
    borderBottomColor: "rgba(125, 120, 142, 0.18)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 38
  },
  profileRowActive: {
  },
  profileRowBadge: {
    backgroundColor: "rgba(45, 177, 106, 0.2)",
    borderRadius: 999,
    color: "#6FEA8E",
    fontSize: 13,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  profileRowCopy: {
    flex: 1,
    minWidth: 0
  },
  profileRowIcon: {
    alignItems: "center",
    backgroundColor: "rgba(79, 32, 129, 0.28)",
    borderRadius: 8,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  profileRowIconDanger: {
    backgroundColor: "rgba(255, 70, 92, 0.11)"
  },
  profileRowLabel: {
    color: colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 16
  },
  profileRowLabelDanger: {
    color: "#FF465C"
  },
  profileRowLast: {
    borderBottomWidth: 0
  },
  profileRowPressed: {
    opacity: 0.74
  },
} as const;
