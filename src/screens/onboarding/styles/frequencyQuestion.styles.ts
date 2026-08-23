import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  resultBackdropImage: {
      ...StyleSheet.absoluteFillObject
    },
  frequencyHeader: {
      alignSelf: "stretch",
      marginBottom: 18
    },
  frequencyHelper: {
      color: "rgba(166, 173, 186, 0.72)",
      fontSize: 15,
      fontWeight: "800",
      lineHeight: 21,
      marginTop: 10,
      maxWidth: 320
    },
  frequencyOption: {
      alignItems: "center",
      backgroundColor: "rgba(24, 26, 32, 0.72)",
      borderColor: "rgba(91, 124, 250, 0.32)",
      borderRadius: 18,
      borderWidth: 1,
      height: 132,
      justifyContent: "center",
      overflow: "hidden",
      paddingHorizontal: 10,
      paddingTop: 12,
      position: "relative",
      shadowColor: "#5B7CFA",
      shadowOffset: { width: 0, height: 7 },
      shadowOpacity: 0.05,
      shadowRadius: 9,
      width: "100%"
    },
  frequencyOptionCheck: {
      alignItems: "center",
      backgroundColor: "#4667E8",
      borderColor: "rgba(91, 124, 250, 0.72)",
      borderRadius: 999,
      borderWidth: 1,
      height: 23,
      justifyContent: "center",
      position: "absolute",
      right: 12,
      shadowColor: "#5B7CFA",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.24,
      shadowRadius: 5,
      top: 12,
      width: 23,
      zIndex: 2
    },
  frequencyOptionGrid: {
      alignSelf: "stretch",
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      rowGap: 14
    },
  frequencyOptionIcon: {
      height: 56,
      marginBottom: 12,
      width: 56
    },
  frequencyOptionMotion: {
      shadowColor: "#5B7CFA",
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.02,
      shadowRadius: 6,
      width: "48%"
    },
  frequencyOptionPressed: {
      opacity: 0.86,
      transform: [{ scale: 0.985 }]
    },
  frequencyOptionSelected: {
      backgroundColor: "rgba(24, 26, 32, 0.86)",
      borderColor: "rgba(91, 124, 250, 0.72)",
      shadowColor: "#5B7CFA",
      shadowOpacity: 0.08,
      shadowRadius: 10
    },
  frequencyOptionTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "900",
      lineHeight: 20,
      textAlign: "center",
      textShadow: "0px 3px 7px rgba(91, 124, 250, 0.06)"
    },
  frequencyProgressWrap: {
      paddingHorizontal: 4,
      paddingTop: 10
    },
  frequencyQuestion: {
      flex: 1,
      justifyContent: "center",
      paddingBottom: 0,
      position: "relative"
    },
  frequencySelectedGlow: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(91, 124, 250, 0.04)",
      borderRadius: 18
    },
  frequencyTitle: {
      color: colors.text,
      fontSize: 33,
      fontWeight: "900",
      letterSpacing: 0,
      lineHeight: 41,
      maxWidth: 330,
      textShadow: "0px 8px 18px rgba(91, 124, 250, 0.2)"
    }
} as const;
