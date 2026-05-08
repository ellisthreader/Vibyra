export const part36 = {
  billingScreen: {
    backgroundColor: "#07070C",
    flex: 1
  },
  billingHeader: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14
  },
  billingHeaderBack: {
    alignItems: "center" as const,
    height: 36,
    justifyContent: "center" as const,
    width: 36
  },
  billingHeaderTitle: {
    color: "#FFFFFF",
    flex: 1,
    fontSize: 20,
    fontWeight: "900" as const,
    letterSpacing: -0.2
  },
  billingHeaderTokens: {
    alignItems: "center" as const,
    backgroundColor: "rgba(15, 15, 24, 0.92)",
    borderColor: "rgba(255, 209, 102, 0.32)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6
  },
  billingHeaderTokensText: {
    color: "#FFD166",
    fontSize: 12,
    fontWeight: "900" as const
  },
  currentPlanCard: {
    alignItems: "center" as const,
    backgroundColor: "rgba(15, 15, 24, 0.92)",
    borderColor: "rgba(139, 92, 255, 0.18)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  currentPlanIconBox: {
    alignItems: "center" as const,
    backgroundColor: "rgba(139, 53, 255, 0.22)",
    borderRadius: 12,
    height: 48,
    justifyContent: "center" as const,
    width: 48
  },
  currentPlanCopy: {
    flex: 1,
    minWidth: 0
  },
  currentPlanKicker: {
    color: "#C259FF",
    fontSize: 10,
    fontWeight: "900" as const,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const
  },
  currentPlanName: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900" as const,
    marginTop: 2
  },
  currentPlanMeta: {
    color: "#9C97AE",
    fontSize: 12,
    fontWeight: "700" as const,
    marginTop: 1
  },
  currentPlanChip: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  currentPlanChipText: {
    color: "#E8E2F7",
    fontSize: 12,
    fontWeight: "800" as const
  }
} as const;
