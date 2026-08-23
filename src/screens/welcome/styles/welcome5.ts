import { colors } from "../../../styles/theme";

export const welcome5 = {
  approvalStep: {
    flex: 1,
    gap: 18,
    justifyContent: "center" as const,
    paddingBottom: 18
  },
  approvalAction: {
    alignSelf: "stretch" as const,
    marginTop: 4
  },
  approvalVisual: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginVertical: 6
  },
  handshakeWrap: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 20,
    justifyContent: "center" as const,
    minHeight: 116,
    paddingVertical: 16
  },
  glyph: {
    alignItems: "center" as const,
    height: 76,
    justifyContent: "center" as const,
    shadowColor: "#A6ADBA",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    width: 76
  },
  glyphBeam: {
    backgroundColor: "rgba(91, 124, 250, 0.78)",
    borderRadius: 999,
    height: 3,
    shadowColor: "#A6ADBA",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
    width: 96
  },
  shieldFloat: {
    alignItems: "center" as const,
    height: 42,
    justifyContent: "center" as const,
    marginBottom: -2,
    shadowColor: "#37D67A",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 14
  },
  burstWrap: {
    alignItems: "center" as const,
    height: 220,
    justifyContent: "center" as const,
    width: "100%" as const
  },
  sparkle: {
    backgroundColor: "#A6ADBA",
    borderRadius: 999,
    height: 8,
    position: "absolute" as const,
    shadowColor: "#A6ADBA",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    width: 8
  },
  checkRing: {
    alignItems: "center" as const,
    backgroundColor: "rgba(55, 214, 122, 0.18)",
    borderColor: "rgba(55, 214, 122, 0.78)",
    borderRadius: 999,
    borderWidth: 3,
    height: 132,
    justifyContent: "center" as const,
    shadowColor: "#37D67A",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 22,
    width: 132
  },
  particle: {
    backgroundColor: "rgba(91, 124, 250, 0.8)",
    borderRadius: 999,
    height: 3,
    position: "absolute" as const,
    width: 3
  },
  sheetBackdrop: {
    alignItems: "center" as const,
    backgroundColor: "rgba(4, 5, 12, 0.78)",
    flex: 1,
    justifyContent: "flex-end" as const,
    padding: 18
  },
  sheet: {
    alignSelf: "stretch" as const,
    backgroundColor: "rgba(24, 26, 32, 0.95)",
    borderColor: "rgba(91, 124, 250, 0.32)",
    borderRadius: 26,
    borderWidth: 1,
    gap: 14,
    padding: 22
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "900" as const
  },
  sheetBody: {
    color: "rgba(166, 173, 186, 0.78)",
    fontSize: 14,
    fontWeight: "700" as const,
    lineHeight: 20
  },
  sheetRow: {
    flexDirection: "row" as const,
    gap: 10
  },
  sheetButton: {
    alignItems: "center" as const,
    borderRadius: 14,
    flex: 1,
    minHeight: 48,
    justifyContent: "center" as const
  },
  sheetButtonGhost: {
    backgroundColor: "rgba(24, 26, 32, 0.6)",
    borderColor: "rgba(91, 124, 250, 0.32)",
    borderWidth: 1
  },
  sheetButtonDanger: {
    backgroundColor: "rgba(242, 58, 100, 0.22)",
    borderColor: "rgba(242, 58, 100, 0.5)",
    borderWidth: 1
  },
  sheetButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900" as const
  }
};
