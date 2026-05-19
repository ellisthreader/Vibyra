import { colors } from "../../../styles/theme";

export const part34 = {
  profileSheetField: {
    gap: 6
  },
  profileSheetFieldLabel: {
    color: "#B8B3CB",
    fontSize: 11,
    fontWeight: "900" as const,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const
  },
  profileSheetInput: {
    backgroundColor: "rgba(15, 15, 24, 0.96)",
    borderColor: "rgba(139, 92, 255, 0.32)",
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "700" as const,
    minHeight: 48,
    paddingHorizontal: 14
  },
  profileSheetText: {
    color: "#D8D2EA",
    fontSize: 14,
    fontWeight: "600" as const,
    lineHeight: 20
  },
  profileSheetMuted: {
    color: "#9C97AE",
    fontSize: 12,
    fontWeight: "700" as const,
    lineHeight: 17
  },
  profileSheetPrimary: {
    alignItems: "center" as const,
    backgroundColor: "#7E3CFF",
    borderRadius: 14,
    flexDirection: "row" as const,
    gap: 8,
    justifyContent: "center" as const,
    minHeight: 50,
    paddingHorizontal: 18
  },
  profileSheetPrimaryText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900" as const
  },
  profileSheetSecondary: {
    alignItems: "center" as const,
    backgroundColor: "rgba(139, 53, 255, 0.12)",
    borderColor: "rgba(139, 92, 255, 0.32)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 8,
    justifyContent: "center" as const,
    minHeight: 48,
    paddingHorizontal: 18
  },
  profileSheetSecondaryText: {
    color: "#E8E2F7",
    fontSize: 14,
    fontWeight: "900" as const
  },
  profileSheetDanger: {
    alignItems: "center" as const,
    backgroundColor: "rgba(255, 70, 92, 0.14)",
    borderColor: "rgba(255, 70, 92, 0.42)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 8,
    justifyContent: "center" as const,
    minHeight: 50,
    paddingHorizontal: 18
  },
  profileSheetDangerText: {
    color: "#FF6478",
    fontSize: 15,
    fontWeight: "900" as const
  },
  profileSheetActions: {
    flexDirection: "row" as const,
    gap: 10,
    marginTop: 4
  },
  profileSheetActionsStack: {
    flexDirection: "column" as const,
    gap: 10,
    marginTop: 4
  },
  securityRowMeta: {
    color: "#C7B6FF",
    fontSize: 11,
    fontWeight: "900" as const
  },
  securityRowPressed: {
    opacity: 0.72
  },
  securityRowTitleLine: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 8
  }
} as const;
