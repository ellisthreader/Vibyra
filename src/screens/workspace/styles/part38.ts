export const part38 = {
  planPillsLabel: {
    color: "#9C97AE",
    fontSize: 11,
    fontWeight: "900" as const,
    letterSpacing: 0.8,
    marginTop: 8,
    textTransform: "uppercase" as const
  },
  planPillsList: {
    gap: 10
  },
  planPill: {
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
  planPillIconBox: {
    alignItems: "center" as const,
    borderRadius: 12,
    height: 44,
    justifyContent: "center" as const,
    width: 44
  },
  planPillCopy: {
    flex: 1,
    minWidth: 0
  },
  planPillName: {
    color: "#F2EEFF",
    fontSize: 15,
    fontWeight: "900" as const
  },
  planPillTokens: {
    color: "#9C97AE",
    fontSize: 11,
    fontWeight: "700" as const,
    marginTop: 2
  },
  planPillPrice: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900" as const
  },
  planPillCurrentChip: {
    backgroundColor: "rgba(74, 222, 128, 0.16)",
    borderColor: "rgba(74, 222, 128, 0.42)",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  planPillCurrentChipText: {
    color: "#4ADE80",
    fontSize: 11,
    fontWeight: "900" as const
  },
  billingFooter: {
    alignItems: "center" as const,
    alignSelf: "stretch" as const,
    backgroundColor: "rgba(15, 15, 24, 0.92)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 10,
    justifyContent: "center" as const,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  billingFooterText: {
    color: "#9C97AE",
    fontSize: 12,
    fontWeight: "800" as const
  },
  billingError: {
    color: "#FF6B7E",
    fontSize: 12,
    fontWeight: "800" as const
  }
} as const;
