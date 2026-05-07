import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part7 = {
  deviceChipPhone: {
    left: 24,
    top: 26
  },
  deviceChipText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "900"
  },
  deviceMomentPanel: {
    borderColor: "rgba(138, 247, 255, 0.12)",
    borderRadius: 34,
    borderWidth: 1,
    bottom: 88,
    left: 0,
    position: "absolute",
    right: 0,
    top: 64
  },
  deviceSyncBeam: {
    backgroundColor: "rgba(46, 235, 255, 0.38)",
    borderRadius: 999,
    height: 132,
    position: "absolute",
    width: 12
  },
  desktopList: {
    gap: 10,
    marginTop: 2
  },
  desktopResult: {
    alignItems: "center",
    backgroundColor: "rgba(46, 235, 255, 0.1)",
    borderColor: "rgba(138, 247, 255, 0.24)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14
  },
  desktopResultMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  desktopResultMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    marginTop: 2
  },
  desktopResultStatusChecking: {
    backgroundColor: "#FFE76A"
  },
  desktopResultStatusCurrent: {
    backgroundColor: "#70F0A2"
  },
  desktopResultStatusDot: {
    borderRadius: 999,
    height: 7,
    width: 7
  },
  desktopResultStatusOffline: {
    backgroundColor: "#7D778D"
  },
  desktopResultStatusOnline: {
    backgroundColor: "#51E895"
  },
  desktopResultTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  healthText: { color: colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17, marginTop: 8, textAlign: "center" },
  generatingContent: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    width: "100%"
  },
  generatingCore: {
    alignItems: "center",
    borderColor: "rgba(214, 132, 255, 0.72)",
    borderRadius: 999,
    borderWidth: 1.5,
    height: 184,
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#A13CFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.78,
    shadowRadius: 42,
    width: 184
  },
  generatingCoreGlass: {
    backgroundColor: "rgba(255, 255, 255, 0.045)",
    borderRadius: 999,
    height: 136,
    left: 20,
    position: "absolute",
    top: 14,
    transform: [{ rotate: "-18deg" }],
    width: 72
  },
  generatingCoreShade: {
    backgroundColor: "rgba(5, 2, 18, 0.28)",
    borderRadius: 999,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: "44%"
  },
  generatingDot: {
    backgroundColor: "rgba(243, 233, 255, 0.96)",
    borderRadius: 999,
    height: 16,
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.92,
    shadowRadius: 18,
    width: 16
  },
  generatingDots: {
    alignItems: "center",
    flexDirection: "row",
    gap: 17,
    justifyContent: "center",
    zIndex: 1
  },
  generatingInnerRing: {
    borderColor: "rgba(159, 68, 255, 0.22)",
    borderRadius: 999,
    borderWidth: 1,
    height: 252,
    position: "absolute",
    width: 252
  },
};
