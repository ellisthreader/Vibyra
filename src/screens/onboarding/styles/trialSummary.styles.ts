import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  trialRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      marginTop: 18,
      paddingHorizontal: 4
    },
  trialText: { color: colors.muted, flex: 1, fontSize: 13, fontWeight: "700", lineHeight: 18 }
} as const;
