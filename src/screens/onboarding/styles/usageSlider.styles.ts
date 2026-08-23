import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  sliderDot: {
      backgroundColor: "rgba(24, 26, 32, 0.95)",
      borderColor: "rgba(91, 124, 250, 0.62)",
      borderRadius: 999,
      borderWidth: 2,
      height: 17,
      width: 17
    },
  sliderDotActive: {
      backgroundColor: "#4667E8",
      borderColor: "#5B7CFA",
      shadowColor: "#5B7CFA",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.72,
      shadowRadius: 9
    },
  sliderFill: {
      backgroundColor: "#4667E8",
      borderRadius: 999,
      height: 6,
      left: 0,
      position: "absolute",
      shadowColor: "#5B7CFA",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.95,
      shadowRadius: 10,
      top: 21
    },
  sliderIcon: {
      height: 42,
      opacity: 0.78,
      width: 42
    },
  sliderIconActive: {
      opacity: 1
    },
  sliderOption: {
      alignItems: "center",
      backgroundColor: "transparent",
      borderColor: "transparent",
      borderRadius: 18,
      borderWidth: 0,
      gap: 8,
      height: 116,
      justifyContent: "center",
      overflow: "hidden",
      paddingHorizontal: 6,
      position: "relative",
      width: "23%"
    },
  sliderOptionActive: {},
  sliderOptionPressed: {
      opacity: 0.92
    },
  sliderOptions: {
      alignSelf: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 4,
      width: "100%"
    },
  sliderOptionText: { color: "rgba(166, 173, 186, 0.72)", fontSize: 11, fontWeight: "900", lineHeight: 14, textAlign: "center", textShadow: "0px 4px 12px rgba(91, 124, 250, 0.12)" },
  sliderOptionTextActive: { color: colors.text, textShadow: "0px 0px 12px rgba(91, 124, 250, 0.42)" },
  sliderStop: {
      alignItems: "center",
      height: 48,
      justifyContent: "center",
      marginLeft: -24,
      position: "absolute",
      top: 0,
      width: 48
    },
  sliderThumb: {
      backgroundColor: colors.text,
      borderColor: "#5B7CFA",
      borderRadius: 999,
      borderWidth: 3,
      height: 26,
      marginLeft: -13,
      position: "absolute",
      shadowColor: "#5B7CFA",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.95,
      shadowRadius: 16,
      top: 11,
      width: 26
    },
  sliderTrack: {
      backgroundColor: "rgba(255, 255, 255, 0.14)",
      borderRadius: 999,
      height: 6,
      left: 0,
      position: "absolute",
      right: 0,
      top: 21
    },
  sliderTrackWrap: {
      alignSelf: "center",
      height: 48,
      marginTop: 22,
      width: "88%"
    }
} as const;
