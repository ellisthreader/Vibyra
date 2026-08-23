import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  navRowFrequency: {
      justifyContent: "space-between",
      paddingBottom: 20,
      paddingTop: 8
    },
  navRowMoment: {
      paddingHorizontal: 24,
      paddingTop: 8,
      position: "relative",
      width: "100%",
      zIndex: 3
    },
  nextButton: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      minHeight: 48,
      paddingHorizontal: 18
    },
  nextButtonFrequency: {
      backgroundColor: "transparent",
      borderColor: "rgba(91, 124, 250, 0.98)",
      borderRadius: 21,
      minHeight: 56,
      overflow: "hidden",
      paddingHorizontal: 0,
      shadowColor: "#5B7CFA",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.82,
      shadowRadius: 24,
      width: 148
    },
  nextButtonFrequencyGradient: {
      alignItems: "center",
      borderRadius: 21,
      flexDirection: "row",
      gap: 13,
      justifyContent: "center",
      minHeight: 56,
      paddingHorizontal: 14,
      shadowColor: "#5B7CFA",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.78,
      shadowRadius: 20,
      width: "100%"
    },
  nextButtonDisabled: {
      opacity: 0.45
    },
  nextText: { color: colors.text, fontSize: 15, fontWeight: "800" },
  nextTextFrequency: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "900"
    }
} as const;
