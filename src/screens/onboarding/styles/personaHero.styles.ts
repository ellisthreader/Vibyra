import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  personaHero: {
      alignItems: "center",
      height: 150,
      justifyContent: "center",
      marginBottom: 2,
      marginTop: 0,
      position: "relative",
      width: "100%"
    },
  personaHeroGlow: {
      backgroundColor: "rgba(91, 124, 250, 0.18)",
      borderRadius: 999,
      height: 146,
      position: "absolute",
      shadowColor: "#5B7CFA",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.7,
      shadowRadius: 36,
      width: 146
    }
} as const;
