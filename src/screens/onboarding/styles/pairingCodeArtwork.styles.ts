import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  codeHalo: {
      alignItems: "center",
      backgroundColor: "rgba(91, 124, 250, 0.14)",
      borderColor: colors.accent,
      borderRadius: 8,
      borderWidth: 1,
      height: 38,
      justifyContent: "center",
      paddingHorizontal: 14
    },
  codeLabel: { color: colors.accent, fontSize: 11, fontWeight: "900", textTransform: "uppercase" }
} as const;
