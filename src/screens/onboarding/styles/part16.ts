import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part16 = {
  syncAuroraBandBottom: {
    borderRadius: 999,
    bottom: 76,
    height: 220,
    left: -90,
    position: "absolute",
    right: -70,
    transform: [{ rotate: "-13deg" }]
  },
  syncBackButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 999,
    height: 52,
    justifyContent: "center",
    width: 52
  },
  syncBeam: {
    backgroundColor: "rgba(46, 235, 255, 0.46)",
    borderRadius: 999,
    height: 7,
    position: "absolute",
    shadowColor: "#2EEBFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 12,
    width: 230
  },
  syncCard: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: "flex-start",
    minHeight: 112,
    paddingHorizontal: 8,
    paddingVertical: 10
  },
  syncCardBody: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 13,
    marginTop: 4,
    textAlign: "center"
  },
  syncCardCopy: {
    alignItems: "center",
    minWidth: 0
  },
  syncCardIcon: {
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    marginBottom: 9,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    width: 34
  },
  syncCards: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    width: "100%"
  },
  syncCardTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 15,
    textAlign: "center"
  },
  syncCenterOrb: {
    alignItems: "center",
    backgroundColor: "rgba(46, 235, 255, 0.2)",
    borderColor: "rgba(138, 247, 255, 0.7)",
    borderRadius: 999,
    borderWidth: 2,
    height: 72,
    justifyContent: "center",
    position: "absolute",
    shadowColor: "#2EEBFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 18,
    width: 72
  },
  syncContent: {
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingTop: 0
  },
  syncDesktopLabel: {
    bottom: 16,
    right: 4
  },
  syncDeviceLabel: {
    alignItems: "center",
    backgroundColor: "rgba(9, 11, 19, 0.84)",
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: "absolute"
  },
  syncDeviceLabelText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  syncFooter: {
    bottom: 0,
    left: 0,
    paddingBottom: 14,
    paddingHorizontal: 20,
    paddingTop: 14,
    position: "absolute",
    right: 0
  },
  syncHero: {
    alignItems: "center",
    height: 228,
    justifyContent: "center",
    marginTop: 8,
    width: "100%"
  },
  syncHeroGlowBlue: {
    backgroundColor: "rgba(46, 235, 255, 0.22)",
    borderRadius: 999,
    height: 148,
    left: 28,
    position: "absolute",
    shadowColor: "#8AF7FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 28,
    top: 30,
    width: 148
  },
  syncHeroGlowPink: {
    backgroundColor: "rgba(242, 58, 205, 0.18)",
    borderRadius: 999,
    height: 138,
    position: "absolute",
    right: 36,
    shadowColor: "#FF7DE3",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 26,
    top: 58,
    width: 138
  },
  syncHeroGlowPurple: {
    backgroundColor: "rgba(109, 59, 255, 0.2)",
    borderRadius: 999,
    bottom: 18,
    height: 168,
    position: "absolute",
    shadowColor: "#A76DFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.56,
    shadowRadius: 30,
    width: 220
  },
  syncHeroImage: {
    height: 228,
    width: 318
  },
  syncMobileLabel: {
    bottom: 20,
    left: 4
  },
  syncPill: {
    alignItems: "center",
    backgroundColor: "rgba(46, 235, 255, 0.08)",
    borderColor: "rgba(46, 235, 255, 0.38)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 0,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
};
