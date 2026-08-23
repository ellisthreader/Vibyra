import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  backButton: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      height: 48,
      paddingHorizontal: 4
    },
  backButtonArt: {
      gap: 8,
      height: 62
    },
  backIconArt: {
      alignItems: "center",
      backgroundColor: "rgba(255, 255, 255, 0.07)",
      borderRadius: 999,
      height: 56,
      justifyContent: "center",
      shadowColor: "#5B7CFA",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.28,
      shadowRadius: 18,
      width: 56
    },
  backText: { color: colors.muted, fontSize: 15, fontWeight: "700" },
  backTextArt: {
      color: "#A6ADBA",
      fontSize: 20,
      fontWeight: "900"
    }
} as const;
