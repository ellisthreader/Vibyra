import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
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
      borderColor: "rgba(91, 124, 250, 0.42)",
      borderRadius: 22,
      borderWidth: 1,
      minHeight: 62,
      overflow: "hidden",
      shadowColor: "#5B7CFA",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.28,
      shadowRadius: 22,
      width: "100%"
    }
} as const;
