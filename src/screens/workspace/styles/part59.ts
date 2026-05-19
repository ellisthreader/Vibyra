import { colors } from "../../../styles/theme";

export const part59 = {
  referralHero: {
    alignItems: "center" as const,
    gap: 8,
    paddingVertical: 6
  },
  referralLoading: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    minHeight: 120
  },
  referralCodeText: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "900" as const,
    letterSpacing: 0,
    textAlign: "center" as const
  },
  referralLink: {
    color: "#9C97AE",
    fontSize: 12,
    fontWeight: "700" as const,
    maxWidth: "100%" as const,
    textAlign: "center" as const
  },
  referralActions: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 20,
    justifyContent: "center" as const,
    paddingTop: 4
  },
  referralActionButton: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 7,
    minHeight: 34,
    paddingHorizontal: 4,
    paddingVertical: 4
  },
  referralActionButtonPressed: {
    opacity: 0.65
  },
  referralActionText: {
    color: "#C7B6FF",
    fontSize: 14,
    fontWeight: "900" as const
  },
  referralStats: {
    flexDirection: "row" as const,
    gap: 8,
    paddingTop: 8
  },
  referralStat: {
    alignItems: "center" as const,
    flex: 1,
    gap: 2
  },
  referralStatValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900" as const
  },
  referralStatLabel: {
    color: "#9C97AE",
    fontSize: 10,
    fontWeight: "900" as const,
    textTransform: "uppercase" as const
  }
} as const;
