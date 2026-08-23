import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  outcomeNumberText: { color: colors.amber, fontSize: 13, fontWeight: "900" },
  outcomeRow: {
      alignItems: "center",
      backgroundColor: "rgba(255, 255, 255, 0.035)",
      borderColor: "rgba(255, 255, 255, 0.06)",
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12
    },
  outcomeStack: { gap: 10, marginTop: 16, width: "100%" },
  outcomeText: { color: colors.text, flex: 1, fontSize: 15, fontWeight: "700", lineHeight: 21 }
} as const;
