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
  skipGhost: {
    alignItems: "center" as const,
    backgroundColor: "transparent" as const,
    borderColor: "rgba(232, 218, 255, 0.32)",
    borderRadius: 999,
    borderWidth: 1,
    height: 36,
    justifyContent: "center" as const,
    minWidth: 88,
    paddingHorizontal: 16,
    position: "absolute" as const,
    right: 16,
    zIndex: 10
  },
  skipGhostPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(232, 218, 255, 0.5)"
  },
  skipGhostText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600" as const,
    letterSpacing: 0.3
  },
  ghostBtn: {
    alignItems: "center" as const,
    alignSelf: "stretch" as const,
    backgroundColor: "transparent" as const,
    borderColor: "rgba(232, 218, 255, 0.32)",
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center" as const,
    minHeight: 56,
    paddingHorizontal: 24
  },
  ghostBtnPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(232, 218, 255, 0.5)"
  },
  ghostBtnText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600" as const,
    letterSpacing: 0.4
  }
};
