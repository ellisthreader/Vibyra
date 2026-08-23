import { StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";

export const styleSource = {
  deviceChip: {
      alignItems: "center",
      backgroundColor: "rgba(24, 26, 32, 0.78)",
      borderColor: "rgba(255, 255, 255, 0.13)",
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
      position: "absolute"
    },
  deviceChipDesktop: {
      bottom: 22,
      right: 24
    }
} as const;
