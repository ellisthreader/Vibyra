import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  generatingOrbitDot: {
      borderRadius: 999,
      height: 16,
      position: "absolute",
      width: 16
    },
  generatingOrbitDotCyan: {
      backgroundColor: "#4667E8",
      right: -8,
      shadowColor: "#5B7CFA",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.95,
      shadowRadius: 16,
      top: "48%"
    },
  generatingOrbitDotMagenta: {
      backgroundColor: "#4667E8",
      left: 22,
      shadowColor: "#5B7CFA",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.95,
      shadowRadius: 16,
      top: 18
    },
  generatingOrbitDotPurple: {
      backgroundColor: "#4667E8",
      bottom: 18,
      left: 10,
      shadowColor: "#5B7CFA",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.9,
      shadowRadius: 14
    },
  generatingOrbitGhost: {
      borderColor: "rgba(91, 124, 250, 0.1)",
      borderRadius: 999,
      borderWidth: 1,
      height: 300,
      position: "absolute",
      width: 300
    },
  generatingOrbitRing: {
      borderColor: "rgba(91, 124, 250, 0.78)",
      borderRadius: 999,
      borderWidth: 1.5,
      height: 270,
      position: "absolute",
      width: 270
    },
  generatingOuterGlow: {
      backgroundColor: "rgba(91, 124, 250, 0.28)",
      borderRadius: 999,
      height: 220,
      position: "absolute",
      shadowColor: "#5B7CFA",
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
      color: "rgba(166, 173, 186, 0.78)",
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
      backgroundColor: "#4667E8",
      borderRadius: 999,
      height: 18,
      shadowColor: "#5B7CFA",
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
      ...StyleSheet.absoluteFillObject
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
    }
} as const;
