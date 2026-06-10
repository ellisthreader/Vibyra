import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const part8 = {
  generatingOrbitDot: {
    borderRadius: 999,
    height: 16,
    position: "absolute",
    width: 16
  },
  generatingOrbitDotCyan: {
    backgroundColor: "#D978FF",
    right: -8,
    shadowColor: "#D978FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 16,
    top: "48%"
  },
  generatingOrbitDotMagenta: {
    backgroundColor: "#B154FF",
    left: 22,
    shadowColor: "#DD79FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 16,
    top: 18
  },
  generatingOrbitDotPurple: {
    backgroundColor: "#8C36FF",
    bottom: 18,
    left: 10,
    shadowColor: "#A46AFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 14
  },
  generatingOrbitGhost: {
    borderColor: "rgba(163, 76, 255, 0.1)",
    borderRadius: 999,
    borderWidth: 1,
    height: 300,
    position: "absolute",
    width: 300
  },
  generatingOrbitRing: {
    borderColor: "rgba(178, 80, 255, 0.78)",
    borderRadius: 999,
    borderWidth: 1.5,
    height: 270,
    position: "absolute",
    width: 270
  },
  generatingOuterGlow: {
    backgroundColor: "rgba(137, 38, 255, 0.28)",
    borderRadius: 999,
    height: 220,
    position: "absolute",
    shadowColor: "#AD4AFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.74,
    shadowRadius: 54,
    width: 220
  },
  generatingScreen: {
    flex: 1,
    overflow: "hidden"
  },
  generatingStatus: {
    color: "rgba(255, 255, 255, 0.98)",
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 33,
    textAlign: "center"
  },
  generatingStatusWrap: {
    alignItems: "center",
    marginTop: 28,
    width: "100%"
  },
  generatingSubtitle: {
    color: "rgba(222, 206, 255, 0.78)",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21,
    marginTop: 12,
    maxWidth: 280,
    textAlign: "center"
  },
  generatingTrack: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 999,
    height: 10,
    marginTop: 30,
    overflow: "visible",
    width: "78%"
  },
  generatingTrackDot: {
    backgroundColor: "#D978FF",
    borderRadius: 999,
    height: 18,
    shadowColor: "#D978FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.98,
    shadowRadius: 16,
    width: 18
  },
  generatingTrackDotWrap: {
    marginLeft: -9,
    marginTop: -4,
    position: "absolute",
    top: 0
  },
  generatingTrackFill: {
    borderRadius: 999,
    height: 10,
    overflow: "hidden"
  },
  generatingTrackFillGradient: {
    ...StyleSheet.absoluteFill
  },
  generatingVisual: {
    alignItems: "center",
    height: 318,
    justifyContent: "center",
    width: "100%"
  },
  input: {
    backgroundColor: colors.elevated,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  identityIconShell: {
    alignItems: "center",
    height: 58,
    justifyContent: "center",
    width: 58
  },
  identityIcon: {
    height: 54,
    width: 54
  },
  insightIcon: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.72,
    shadowRadius: 20,
    width: 48
  },
  insightRow: {
    borderColor: "rgba(156, 89, 255, 0.42)",
    borderRadius: 22,
    borderWidth: 1,
    minHeight: 62,
    overflow: "hidden",
    shadowColor: "#8A36FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    width: "100%"
  },
};
