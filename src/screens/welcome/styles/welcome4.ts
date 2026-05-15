import { colors } from "../../../styles/theme";

export const welcome4 = {
  radarWrap: {
    alignItems: "center" as const,
    height: 200,
    justifyContent: "center" as const,
    marginBottom: 12,
    width: "100%" as const
  },
  radarRing: {
    borderColor: "rgba(176, 95, 255, 0.85)",
    borderRadius: 999,
    borderWidth: 2,
    height: 160,
    position: "absolute" as const,
    width: 160
  },
  radarCore: {
    alignItems: "center" as const,
    backgroundColor: "rgba(143, 50, 255, 0.92)",
    borderRadius: 999,
    height: 64,
    justifyContent: "center" as const,
    shadowColor: "#A741FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 24,
    width: 64
  },
  desktopList: {
    gap: 10,
    marginTop: 14
  },
  desktopRow: {
    alignItems: "center" as const,
    backgroundColor: "rgba(12, 9, 38, 0.78)",
    borderColor: "rgba(154, 77, 255, 0.32)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  desktopName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900" as const
  },
  desktopStatus: {
    color: "rgba(226, 219, 255, 0.7)",
    fontSize: 12,
    fontWeight: "700" as const,
    marginTop: 2
  },
  codeInput: {
    backgroundColor: "rgba(15, 10, 42, 0.82)",
    borderColor: "rgba(154, 77, 255, 0.32)",
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    fontSize: 22,
    fontWeight: "900" as const,
    letterSpacing: 6,
    minHeight: 56,
    paddingHorizontal: 18,
    textAlign: "center" as const,
    textTransform: "uppercase" as const
  },
  searchingRow: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 10,
    justifyContent: "center" as const,
    marginTop: 8
  },
  searchingText: {
    color: "#D8BCFF",
    fontSize: 13,
    fontWeight: "800" as const
  },
  helpText: {
    color: "rgba(226, 219, 255, 0.6)",
    fontSize: 12,
    fontWeight: "700" as const,
    marginTop: 10,
    textAlign: "center" as const
  }
};
