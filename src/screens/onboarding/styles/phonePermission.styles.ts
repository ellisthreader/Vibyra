import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  phonePermission: {
      alignItems: "center",
      alignSelf: "stretch",
      backgroundColor: colors.elevated,
      borderColor: colors.border,
      borderRadius: 16,
      borderWidth: 1,
      gap: 10,
      marginTop: 4,
      padding: 14
    }
} as const;
