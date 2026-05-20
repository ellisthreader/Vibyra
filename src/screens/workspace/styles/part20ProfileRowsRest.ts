import { colors } from "../../../styles/theme";

export const part20ProfileRowsRest = {
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
    gap: 7,
    minWidth: 0,
    paddingRight: 2
  },
  profileLevelTrack: {
    backgroundColor: "rgba(125, 120, 142, 0.2)",
    borderRadius: 999,
    height: 5,
    overflow: "hidden"
  },
  profileLevelModalContent: {
    gap: 12,
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
    backgroundColor: "rgba(15, 15, 24, 0.72)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    overflow: "hidden",
    padding: 15
  },
  profileLevelModalHeroTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 13
  },
  profileLevelModalKicker: {
    color: "#9C97AE",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0,
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
    marginTop: -2
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
    color: "#AFA8C4",
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16
  },
  profileLevelModalTitle: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 34
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
  }
} as const;
