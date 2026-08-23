import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
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
      backgroundColor: "rgba(91, 124, 250, 0.14)",
      borderRadius: 999,
      bottom: -56,
      height: 120,
      position: "absolute",
      right: -34,
      shadowColor: "#5B7CFA",
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
      color: "#A6ADBA",
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
    }
} as const;
