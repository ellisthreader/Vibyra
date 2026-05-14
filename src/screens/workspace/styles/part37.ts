export const part37 = {
  featuredPlanWrap: {
    borderRadius: 20,
    position: "relative" as const
  },
  featuredPlanGlow: {
    borderRadius: 22,
    borderWidth: 1.5,
    bottom: -2,
    left: -2,
    position: "absolute" as const,
    right: -2,
    top: -2
  },
  featuredPlanCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden" as const
  },
  featuredPlanInner: {
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16
  },
  featuredPlanHead: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 12
  },
  featuredPlanIcon: {
    alignItems: "center" as const,
    borderRadius: 12,
    height: 40,
    justifyContent: "center" as const,
    width: 40
  },
  featuredPlanHeadCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  featuredPlanNameRow: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6
  },
  featuredPlanName: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900" as const,
    letterSpacing: -0.2
  },
  featuredPlanRibbon: {
    alignItems: "center" as const,
    borderRadius: 7,
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
  featuredPlanPriceBlock: {
    alignItems: "flex-end" as const,
    flexShrink: 0,
    gap: 2
  },
  featuredPlanPriceRow: {
    alignItems: "baseline" as const,
    flexDirection: "row" as const
  },
  featuredPlanPrice: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900" as const,
    letterSpacing: -0.6
  },
  featuredPlanCadence: {
    color: "#9C97AE",
    fontSize: 12,
    fontWeight: "700" as const,
    marginLeft: 1
  },
  featuredPlanAnnualNote: {
    color: "#FFD166",
    fontSize: 10.5,
    fontWeight: "800" as const,
    textAlign: "right" as const
  },
  featuredPlanCurrentChip: {
    alignItems: "center" as const,
    alignSelf: "flex-end" as const,
    backgroundColor: "rgba(74, 222, 128, 0.14)",
    borderColor: "rgba(74, 222, 128, 0.36)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 4,
    marginTop: 2,
    paddingHorizontal: 9,
    paddingVertical: 3
  },
  featuredPlanCurrentChipText: {
    color: "#4ADE80",
    fontSize: 10.5,
    fontWeight: "900" as const,
    letterSpacing: 0.3
  },
  featuredPlanDivider: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    height: 1
  },
  featuredPlanPerks: {
    gap: 8
  },
  featuredPlanPerk: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 8
  },
  featuredPlanPerkText: {
    color: "rgba(255, 255, 255, 0.88)",
    flex: 1,
    fontSize: 12.5,
    fontWeight: "600" as const,
    lineHeight: 17
  }
} as const;
