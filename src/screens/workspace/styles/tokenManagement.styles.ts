import { Platform, StyleSheet } from "react-native";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";

export const styleSource = {
  tokenManageButton: {
      borderRadius: 13,
      overflow: "hidden",
      shadowColor: "#4667E8",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.24,
      shadowRadius: 22
    },
  tokenManageButtonPressed: {
      opacity: 0.86,
      transform: [{ scale: 0.99 }]
    },
  tokenManageGradient: {
      alignItems: "center",
      flexDirection: "row",
      gap: 9,
      justifyContent: "center",
      minHeight: 48
    },
  tokenManageText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "900"
    }
} as const;
