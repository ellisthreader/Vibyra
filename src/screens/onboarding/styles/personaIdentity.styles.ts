import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  personaHeroOrbit: {
      borderColor: "rgba(91, 124, 250, 0.24)",
      borderRadius: 999,
      borderWidth: 1,
      height: 176,
      position: "absolute",
      width: 176
    },
  personaIcon: {
      height: 140,
      width: 140
    },
  profileLabel: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "800",
      marginTop: 22,
      textAlign: "center"
    }
} as const;
