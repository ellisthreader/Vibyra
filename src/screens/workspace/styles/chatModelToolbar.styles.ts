import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const styleSource = {
  chatModelButton: {
      alignItems: "center",
      backgroundColor: "rgba(255, 255, 255, 0.045)",
      borderColor: "rgba(116, 144, 255, 0.18)",
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: "row",
      flexShrink: 1,
      gap: 6,
      height: 36,
      minWidth: 0,
      paddingHorizontal: 10
    },
  chatModelButtonText: {
      color: "#A6ADBA",
      flexShrink: 1,
      fontSize: 12.5,
      fontWeight: "800",
      letterSpacing: 0.2
    },
  chatModelButtonBadge: {
      backgroundColor: "rgba(124, 241, 179, 0.11)",
      borderColor: "rgba(124, 241, 179, 0.28)",
      borderRadius: 999,
      borderWidth: 1,
      color: "#7CF1B3",
      fontSize: 9,
      fontWeight: "900",
      overflow: "hidden",
      paddingHorizontal: 6,
      paddingVertical: 2,
      textTransform: "uppercase"
    },
  chatModelButtonToolbar: {
      flex: 1,
      minWidth: 0
    }
} as const;
