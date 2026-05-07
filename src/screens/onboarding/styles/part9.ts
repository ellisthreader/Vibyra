import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part9 = {
  insightRowFill: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    minHeight: 62,
    overflow: "hidden",
    paddingHorizontal: 18,
    paddingVertical: 7,
    width: "100%"
  },
  insightRowGlow: {
    backgroundColor: "rgba(172, 90, 255, 0.14)",
    borderRadius: 999,
    bottom: -56,
    height: 120,
    position: "absolute",
    right: -34,
    shadowColor: "#A442FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.52,
    shadowRadius: 34,
    width: 170
  },
  insightStack: {
    gap: 8,
    marginTop: 14,
    width: "100%"
  },
  insightSubtitle: {
    color: "#BEB5DF",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19,
    marginTop: 4,
    textAlign: "center"
  },
  insightText: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20
  },
  insightChevron: {
    marginRight: -2
  },
  mainPlanLabel: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderRadius: 999,
    borderWidth: 1,
    color: colors.text,
    fontSize: 10,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
    textTransform: "uppercase"
  },
  momentBody: {
    color: "#D8D8EA",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 23,
    marginTop: 12,
    textAlign: "center"
  },
  momentBullet: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.055)",
    borderColor: "rgba(138, 247, 255, 0.12)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    width: "100%"
  },
  momentBulletDot: {
    borderRadius: 999,
    height: 10,
    width: 10
  },
  momentBulletStack: {
    gap: 9,
    marginTop: 24,
    width: "100%"
  },
  momentBulletText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19
  },
  momentGlow: {
    backgroundColor: "rgba(46, 235, 255, 0.18)",
    borderRadius: 999,
    height: 220,
    position: "absolute",
    width: 220
  },
  momentImage: {
    height: 214,
    width: 214
  },
  momentKicker: {
    color: "#8AF7FF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginBottom: 8,
    marginTop: 8,
    textAlign: "center",
    textTransform: "uppercase"
  },
  momentOrbit: {
    alignItems: "center",
    borderColor: "rgba(138, 247, 255, 0.16)",
    borderRadius: 999,
    borderWidth: 1,
    height: 236,
    justifyContent: "flex-start",
    paddingTop: 3,
    position: "absolute",
    width: 236
  },
  momentOrbitDot: {
    backgroundColor: "#8AF7FF",
    borderRadius: 999,
    height: 7,
    width: 7
  },
  momentScreen: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
    paddingBottom: 10,
    paddingHorizontal: 2
  },
  momentVisual: {
    alignItems: "center",
    height: 246,
    justifyContent: "center",
    marginBottom: 4,
    width: "100%"
  },
  mutedText: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  momentProgressSafe: {
    width: "100%"
  },
  navRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 16
  },
};
