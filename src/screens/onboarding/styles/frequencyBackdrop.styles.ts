import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  errorText: { color: colors.error, fontSize: 13, fontWeight: "700", marginBottom: 10, textAlign: "center" },
  frequencyCornerGlow: {
      backgroundColor: "rgba(91, 124, 250, 0.2)",
      borderRadius: 999,
      height: 92,
      left: -48,
      opacity: 0.64,
      position: "absolute",
      shadowColor: "#5B7CFA",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.36,
      shadowRadius: 28,
      top: -44,
      width: 92
    },
  frequencyCornerGlowSelected: {
      opacity: 0.9
    },
  frequencyBackdropImage: {
      ...StyleSheet.absoluteFillObject
    },
  quizBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#0E0F12",
      overflow: "hidden"
    },
  quizBackdropShade: {
      ...StyleSheet.absoluteFillObject
    },
  quizBackdropVignette: {
      ...StyleSheet.absoluteFillObject
    }
} as const;
