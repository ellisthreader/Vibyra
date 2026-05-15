import { colors } from "../../../styles/theme";

export const welcome2 = {
  primaryBtn: {
    alignItems: "center" as const,
    alignSelf: "stretch" as const,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 12,
    justifyContent: "center" as const,
    minHeight: 60,
    overflow: "hidden" as const,
    shadowColor: "#A741FF",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.45,
    shadowRadius: 22
  },
  primaryBtnPressed: {
    transform: [{ scale: 0.975 }]
  },
  primaryBtnGradient: {
    alignItems: "center" as const,
    alignSelf: "stretch" as const,
    flexDirection: "row" as const,
    gap: 12,
    justifyContent: "center" as const,
    minHeight: 60,
    paddingHorizontal: 18,
    paddingVertical: 12,
    width: "100%" as const
  },
  primaryBtnText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900" as const,
    letterSpacing: 0.2,
    lineHeight: 22
  },
  shimmer: {
    backgroundColor: "rgba(255,255,255,0.34)",
    bottom: 0,
    height: "100%" as const,
    position: "absolute" as const,
    top: 0,
    width: 60
  },
  skipPill: {
    alignItems: "center" as const,
    backgroundColor: "rgba(20, 14, 50, 0.6)",
    borderColor: "rgba(180, 140, 255, 0.32)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 6,
    height: 44,
    minWidth: 120,
    paddingHorizontal: 18,
    justifyContent: "center" as const
  },
  skipPillText: {
    color: "rgba(232, 218, 255, 0.92)",
    fontSize: 13,
    fontWeight: "800" as const
  },
  skipPillTop: {
    position: "absolute" as const,
    right: 16,
    top: 16,
    zIndex: 5
  }
};
