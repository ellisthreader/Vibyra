import { colors } from "../../../styles/theme";

export const welcome3 = {
  indicator: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 8,
    justifyContent: "center" as const,
    paddingVertical: 14
  },
  indicatorDot: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    height: 8,
    width: 8
  },
  indicatorDotActive: {
    backgroundColor: "#4667E8",
    shadowColor: "#5B7CFA",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10
  },
  indicatorDotComplete: {
    backgroundColor: "rgba(91, 124, 250, 0.5)"
  },
  card: {
    alignSelf: "stretch" as const,
    backgroundColor: "rgba(24, 26, 32, 0.78)",
    borderColor: "rgba(91, 124, 250, 0.5)",
    borderRadius: 24,
    borderWidth: 1.5,
    paddingHorizontal: 22,
    paddingVertical: 22,
    shadowColor: "#5B7CFA",
    shadowOffset: { width: 0, height: 22 },
    shadowOpacity: 0.34,
    shadowRadius: 28
  },
  cardTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900" as const,
    lineHeight: 28,
    marginBottom: 6
  },
  cardBody: {
    color: "rgba(166, 173, 186, 0.74)",
    fontSize: 14,
    fontWeight: "700" as const,
    lineHeight: 20
  },
  cardEyebrow: {
    color: "#A6ADBA",
    fontSize: 11,
    fontWeight: "900" as const,
    letterSpacing: 2,
    marginBottom: 8,
    textTransform: "uppercase" as const
  },
  modeTabs: {
    backgroundColor: "rgba(24, 26, 32, 0.74)",
    borderColor: "rgba(91, 124, 250, 0.22)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 6,
    marginBottom: 14,
    padding: 4
  },
  modeTab: {
    alignItems: "center" as const,
    borderRadius: 999,
    flex: 1,
    flexDirection: "row" as const,
    gap: 6,
    justifyContent: "center" as const,
    minHeight: 36
  },
  modeTabActive: {
    backgroundColor: "rgba(91, 124, 250, 0.28)"
  },
  modeTabText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900" as const
  },
  modeTabTextActive: {
    color: colors.text
  }
};
