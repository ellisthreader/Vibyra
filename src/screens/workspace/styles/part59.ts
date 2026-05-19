import { colors } from "../../../styles/theme";

export const part59 = {
  referralIntro: {
    color: "#D8D2EA",
    fontSize: 14,
    fontWeight: "700" as const,
    lineHeight: 20
  },
  referralHero: {
    backgroundColor: "rgba(12, 14, 25, 0.96)",
    borderColor: "rgba(56, 189, 248, 0.3)",
    borderRadius: 18,
    borderWidth: 1,
    gap: 13,
    overflow: "hidden" as const,
    padding: 16
  },
  referralHeroTop: {
    alignItems: "flex-start" as const,
    flexDirection: "row" as const,
    gap: 12,
    justifyContent: "space-between" as const
  },
  referralHeroCopy: {
    flex: 1,
    minWidth: 0
  },
  referralEyebrow: {
    color: "#7DD3FC",
    fontSize: 11,
    fontWeight: "900" as const,
    textTransform: "uppercase" as const
  },
  referralHeroTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900" as const,
    lineHeight: 25,
    marginTop: 3
  },
  referralCodeBox: {
    alignItems: "center" as const,
    backgroundColor: "rgba(56, 189, 248, 0.11)",
    borderColor: "rgba(56, 189, 248, 0.24)",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9
  },
  referralCodeText: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900" as const,
    letterSpacing: 0
  },
  referralLink: {
    color: "#9C97AE",
    fontSize: 12,
    fontWeight: "700" as const
  },
  referralRewards: {
    flexDirection: "row" as const,
    gap: 8
  },
  referralRewardPill: {
    backgroundColor: "rgba(255, 209, 102, 0.12)",
    borderColor: "rgba(255, 209, 102, 0.24)",
    borderRadius: 13,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    padding: 10
  },
  referralRewardValue: {
    color: "#FFD166",
    fontSize: 18,
    fontWeight: "900" as const
  },
  referralRewardLabel: {
    color: "#D8D2EA",
    fontSize: 11,
    fontWeight: "800" as const,
    lineHeight: 15
  },
  referralActions: {
    flexDirection: "row" as const,
    gap: 10
  },
  referralStats: {
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderTopWidth: 1,
    flexDirection: "row" as const,
    gap: 8,
    paddingTop: 12
  },
  referralStat: {
    flex: 1,
    gap: 2
  },
  referralStatValue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900" as const
  },
  referralStatLabel: {
    color: "#9C97AE",
    fontSize: 10,
    fontWeight: "900" as const,
    textTransform: "uppercase" as const
  },
  referralFinePrint: {
    color: "#8F89A3",
    fontSize: 11,
    fontWeight: "700" as const,
    lineHeight: 16
  }
} as const;
