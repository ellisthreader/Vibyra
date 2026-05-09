export const part37 = {
  featuredPlanWrap: {
    borderRadius: 18,
    flex: 1,
    minHeight: 118,
    position: "relative" as const
  },
  featuredPlanGlow: {
    borderRadius: 20,
    borderWidth: 1.5,
    bottom: -2,
    left: -2,
    position: "absolute" as const,
    right: -2,
    top: -2
  },
  featuredPlanCard: {
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    overflow: "hidden" as const
  },
  featuredPlanInner: {
    flex: 1,
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  featuredPlanHead: {
    alignItems: "flex-start" as const,
    flexDirection: "row" as const,
    gap: 11
  },
  featuredPlanIcon: {
    alignItems: "center" as const,
    borderRadius: 10,
    height: 36,
    justifyContent: "center" as const,
    width: 36
  },
  featuredPlanHeadCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  featuredPlanNameRow: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 8
  },
  featuredPlanName: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900" as const,
    letterSpacing: -0.2
  },
  featuredPlanRibbon: {
    alignItems: "center" as const,
    borderRadius: 6,
    flexDirection: "row" as const,
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2
  },
  featuredPlanRibbonText: {
    fontSize: 9,
    fontWeight: "900" as const,
    letterSpacing: 0.5,
    textTransform: "uppercase" as const
  },
  featuredPlanTokens: {
    color: "#9C97AE",
    fontSize: 12,
    fontWeight: "700" as const
  },
  featuredPlanRight: {
    alignItems: "flex-end" as const,
    gap: 4
  },
  featuredPlanPriceRow: {
    alignItems: "baseline" as const,
    flexDirection: "row" as const
  },
  featuredPlanPrice: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900" as const,
    letterSpacing: -0.4
  },
  featuredPlanCadence: {
    color: "#9C97AE",
    fontSize: 12,
    fontWeight: "700" as const
  },
  featuredPlanAnnualNote: {
    color: "#FFD166",
    fontSize: 10.5,
    fontWeight: "800" as const
  },
  featuredPlanCurrentChip: {
    alignItems: "center" as const,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.22)",
    borderRadius: 7,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3
  },
  featuredPlanCurrentChipText: {
    color: "#E8E2F7",
    fontSize: 11,
    fontWeight: "900" as const
  },
  featuredPlanPerks: {
    flex: 1,
    gap: 6,
    justifyContent: "center" as const
  },
  featuredPlanPerk: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 8
  },
  featuredPlanPerkText: {
    color: "rgba(255, 255, 255, 0.86)",
    flex: 1,
    fontSize: 12,
    fontWeight: "600" as const,
    lineHeight: 16
  }
} as const;
